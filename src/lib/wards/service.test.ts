import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDbConnection, getDb } from "@/db/client";
import { createHome } from "@/lib/homes/service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/homes/errors";
import { createUser } from "@/lib/users/service";
import { createResident } from "@/lib/residents/service";
import { createWard, countActiveResidentsByWardId, isWardAtCapacity, listWardsForHome, updateWard } from "./service";

const STRONG = "ChangeMeNow!1";
const adminActor = { userId: "admin-actor", role: "admin" as const };

function runMigrations(file: string) {
  const sqlite = new Database(file);
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  sqlite.close();
}

describe("wards catalog per home (admin vs care)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-wards-${randomUUID()}.sqlite`);
    process.env.DATABASE_PATH = dbPath;
    closeDbConnection();
    runMigrations(dbPath);
  });

  afterEach(() => {
    closeDbConnection();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it("lets an Admin add a ward for a home", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "Sunrise",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "  North Wing  ",
    });
    expect(ward.homeId).toBe(home.id);
    expect(ward.label).toBe("North Wing");
    expect(ward.sortOrder).toBeNull();
    expect(ward.bedCount).toBeNull();
    expect(ward.archivedAtUtcMs).toBeNull();
    expect(ward.monthlyRatePerPersonMinor).toBeNull();
  });

  it("lets an Admin create a ward with bed count", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "ICU",
      bedCount: 24,
    });
    expect(ward.bedCount).toBe(24);
  });

  it("rejects invalid bed count values", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    expect(() =>
      createWard(db, adminActor, home.id, { label: "W", bedCount: -1 }),
    ).toThrow(ValidationError);
    expect(() =>
      createWard(db, adminActor, home.id, { label: "W", bedCount: 1.5 }),
    ).toThrow(ValidationError);
  });

  it("lets a Care user add a ward in an assigned home", async () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const care = await createUser(db, "admin", {
      email: "care-ward-create@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: home.id,
    });
    const ward = createWard(
      db,
      { userId: care.id, role: "care" },
      home.id,
      { label: "Ward A" },
    );
    expect(ward.label).toBe("Ward A");
  });

  it("does not let a Care user add a ward for a non-assigned home", async () => {
    const db = getDb();
    const assigned = createHome(db, "admin", {
      name: "Mine",
      defaultCurrencyCode: "NZD",
    });
    const other = createHome(db, "admin", {
      name: "Other",
      defaultCurrencyCode: "NZD",
    });
    const care = await createUser(db, "admin", {
      email: "care-ward-x@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: assigned.id,
    });
    expect(() =>
      createWard(
        db,
        { userId: care.id, role: "care" },
        other.id,
        { label: "Tamper" },
      ),
    ).toThrow(ForbiddenError);
  });

  it("rejects creating a ward for a missing home", () => {
    const db = getDb();
    expect(() =>
      createWard(db, adminActor, randomUUID(), { label: "X" }),
    ).toThrow(NotFoundError);
  });

  it("lists wards for a home with explicit sort order before unlabeled rows", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    createWard(db, adminActor, home.id, { label: "Beta (no order)" });
    createWard(db, adminActor, home.id, { label: "Second", sortOrder: 2 });
    createWard(db, adminActor, home.id, { label: "First", sortOrder: 1 });
    expect(listWardsForHome(db, adminActor, home.id).map((w) => w.label)).toEqual([
      "First",
      "Second",
      "Beta (no order)",
    ]);
  });

  it("lets a Care user list wards for an assigned home", async () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    createWard(db, adminActor, home.id, { label: "W1" });
    const care = await createUser(db, "admin", {
      email: "care-list-wards@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: home.id,
    });
    expect(
      listWardsForHome(db, { userId: care.id, role: "care" }, home.id).map(
        (w) => w.label,
      ),
    ).toEqual(["W1"]);
  });

  it("does not let a Care user list wards for another home (ID tampering)", async () => {
    const db = getDb();
    const mine = createHome(db, "admin", {
      name: "Mine",
      defaultCurrencyCode: "NZD",
    });
    const other = createHome(db, "admin", {
      name: "Other",
      defaultCurrencyCode: "NZD",
    });
    createWard(db, adminActor, other.id, { label: "Secret" });
    const care = await createUser(db, "admin", {
      email: "care-tamper-list@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: mine.id,
    });
    expect(() =>
      listWardsForHome(db, { userId: care.id, role: "care" }, other.id),
    ).toThrow(ForbiddenError);
  });

  it("does not surface a ward when the home id in the path does not match", () => {
    const db = getDb();
    const homeA = createHome(db, "admin", {
      name: "A",
      defaultCurrencyCode: "NZD",
    });
    const homeB = createHome(db, "admin", {
      name: "B",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, homeA.id, { label: "Only A" });
    expect(() =>
      updateWard(db, adminActor, homeB.id, ward.id, { label: "Nope" }),
    ).toThrow(NotFoundError);
  });

  it("lets an Admin update label, sort order, and archive state", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const w = createWard(db, adminActor, home.id, { label: "Before" });
    const updated = updateWard(db, adminActor, home.id, w.id, {
      label: "After",
      sortOrder: 5,
      archived: true,
    });
    expect(updated.label).toBe("After");
    expect(updated.sortOrder).toBe(5);
    expect(updated.archivedAtUtcMs).not.toBeNull();

    const restored = updateWard(db, adminActor, home.id, w.id, {
      archived: false,
    });
    expect(restored.archivedAtUtcMs).toBeNull();

    const withBeds = updateWard(db, adminActor, home.id, w.id, {
      bedCount: 8,
    });
    expect(withBeds.bedCount).toBe(8);
    const cleared = updateWard(db, adminActor, home.id, w.id, {
      bedCount: null,
    });
    expect(cleared.bedCount).toBeNull();
  });

  it("lets a Care user update a ward in an assigned home", async () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const w = createWard(db, adminActor, home.id, { label: "W" });
    const care = await createUser(db, "admin", {
      email: "care-update@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: home.id,
    });
    const updated = updateWard(
      db,
      { userId: care.id, role: "care" },
      home.id,
      w.id,
      { label: "Renamed" },
    );
    expect(updated.label).toBe("Renamed");
  });

  it("does not let a Care user update a ward via another home id (tampering)", async () => {
    const db = getDb();
    const mine = createHome(db, "admin", {
      name: "Mine",
      defaultCurrencyCode: "NZD",
    });
    const other = createHome(db, "admin", {
      name: "Other",
      defaultCurrencyCode: "NZD",
    });
    const w = createWard(db, adminActor, mine.id, { label: "W" });
    const care = await createUser(db, "admin", {
      email: "care-update-tamper@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: mine.id,
    });
    expect(() =>
      updateWard(
        db,
        { userId: care.id, role: "care" },
        other.id,
        w.id,
        { label: "X" },
      ),
    ).toThrow(ForbiddenError);
  });

  it("rejects invalid sort order values", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    expect(() =>
      createWard(db, adminActor, home.id, {
        label: "W",
        sortOrder: Number.NaN,
      }),
    ).toThrow(ValidationError);
  });

  it("lets an Admin set and clear monthlyRatePerPersonMinor", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const w = createWard(db, adminActor, home.id, {
      label: "Billable",
      monthlyRatePerPersonMinor: 4500_00,
    });
    expect(w.monthlyRatePerPersonMinor).toBe(4500_00);

    const cleared = updateWard(db, adminActor, home.id, w.id, {
      monthlyRatePerPersonMinor: null,
    });
    expect(cleared.monthlyRatePerPersonMinor).toBeNull();
  });

  it("rejects negative or non-integer monthly rate", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    expect(() =>
      createWard(db, adminActor, home.id, {
        label: "W",
        monthlyRatePerPersonMinor: -1,
      }),
    ).toThrow(ValidationError);
    expect(() =>
      createWard(db, adminActor, home.id, {
        label: "W",
        monthlyRatePerPersonMinor: 1.5,
      }),
    ).toThrow(ValidationError);
  });

  it("does not let Care set monthly rate on create or update", async () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const care = await createUser(db, "admin", {
      email: "care-rate@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: home.id,
    });
    const actor = { userId: care.id, role: "care" as const };
    expect(() =>
      createWard(db, actor, home.id, {
        label: "X",
        monthlyRatePerPersonMinor: 100,
      }),
    ).toThrow(ForbiddenError);

    const w = createWard(db, adminActor, home.id, { label: "Y" });
    expect(() =>
      updateWard(db, actor, home.id, w.id, {
        monthlyRatePerPersonMinor: 100,
      }),
    ).toThrow(ForbiddenError);
  });

  it("omits monthlyRatePerPersonMinor from Care ward lists", async () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    createWard(db, adminActor, home.id, {
      label: "Paid",
      monthlyRatePerPersonMinor: 99,
    });
    const care = await createUser(db, "admin", {
      email: "care-list-rate@example.com",
      password: STRONG,
      role: "care",
      primaryHomeId: home.id,
    });
    const listed = listWardsForHome(db, { userId: care.id, role: "care" }, home.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty("monthlyRatePerPersonMinor");
  });

  it("counts active residents per ward and detects capacity", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const fullWard = createWard(db, adminActor, home.id, {
      label: "Full",
      bedCount: 1,
    });
    const openWard = createWard(db, adminActor, home.id, {
      label: "Open",
      bedCount: 2,
    });
    createWard(db, adminActor, home.id, { label: "Uncapped" });

    createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Resident One",
      dob: "1950-01-01",
      admissionDate: "2024-01-01",
      wardId: fullWard.id,
    });
    createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Resident Two",
      dob: "1951-02-02",
      admissionDate: "2024-02-01",
      wardId: openWard.id,
    });

    const counts = countActiveResidentsByWardId(db, home.id);
    expect(counts.get(fullWard.id)).toBe(1);
    expect(counts.get(openWard.id)).toBe(1);
    expect(isWardAtCapacity(1, 1)).toBe(true);
    expect(isWardAtCapacity(2, 1)).toBe(false);
    expect(isWardAtCapacity(null, 99)).toBe(false);
  });
});

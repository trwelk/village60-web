import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDbConnection, getDb } from "@/db/client";
import { otherCharges, users } from "@/db/schema";
import { createHome } from "@/lib/homes/service";
import { ForbiddenError, NotFoundError } from "@/lib/homes/errors";
import { createResident } from "@/lib/residents/service";
import { createWard } from "@/lib/wards/service";
import { ValidationError } from "@/lib/homes/errors";
import {
  initializeMissingResidentOtherCharges,
  RECORDED_OTHER_CHARGE_MESSAGE,
  listResidentOtherCharges,
  updateResidentOtherCharge,
} from "./otherCharges";

const adminActor = { userId: "admin-oc", role: "admin" as const };
const careActor = { userId: "care-oc", role: "care" as const };

function runMigrations(file: string) {
  const sqlite = new Database(file);
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  sqlite.close();
}

function seedAdminUser(db: ReturnType<typeof getDb>, userId: string) {
  const now = Date.now();
  db.insert(users)
    .values({
      id: userId,
      email: `${userId}@oc.test`,
      passwordHash: "x",
      role: "admin",
      failureTimestampsUtcMs: "[]",
      lockedUntilUtcMs: null,
      createdAtUtcMs: now,
      primaryHomeId: null,
    })
    .run();
}

function seedCareUser(db: ReturnType<typeof getDb>, userId: string) {
  const now = Date.now();
  db.insert(users)
    .values({
      id: userId,
      email: `${userId}@oc.test`,
      passwordHash: "x",
      role: "care",
      failureTimestampsUtcMs: "[]",
      lockedUntilUtcMs: null,
      createdAtUtcMs: now,
      primaryHomeId: null,
    })
    .run();
}

describe("other charges (17a)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-oc-${randomUUID()}.sqlite`);
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

  it("returns an empty list when no rows exist", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W1",
      monthlyRatePerPersonMinor: 1000,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Pat Resident",
      dob: "1950-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });

    const list = listResidentOtherCharges(db, adminActor, home.id, res.id);
    expect(list).toEqual([]);
  });

  it("lists registration before deposit and exposes amounts and payment fields", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W1",
      monthlyRatePerPersonMinor: 1000,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Pat Resident",
      dob: "1950-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const residentId = res.id;

    const now = Date.now();
    db.insert(otherCharges)
      .values({
        id: randomUUID(),
        residentId,
        type: "deposit",
        amountMinor: 500_00,
        received: false,
        paidOn: null,
        createdAtUtcMs: now,
        updatedAtUtcMs: now,
      })
      .run();
    db.insert(otherCharges)
      .values({
        id: randomUUID(),
        residentId,
        type: "registration",
        amountMinor: 250_00,
        received: true,
        paidOn: "2026-01-15",
        createdAtUtcMs: now,
        updatedAtUtcMs: now,
      })
      .run();

    const list = listResidentOtherCharges(
      db,
      adminActor,
      home.id,
      residentId,
    );
    expect(list.map((x) => x.type)).toEqual(["registration", "deposit"]);
    expect(list[0]).toMatchObject({
      type: "registration",
      amountMinor: 250_00,
      received: true,
      paidOn: "2026-01-15",
    });
    expect(list[1]).toMatchObject({
      type: "deposit",
      amountMinor: 500_00,
      received: false,
      paidOn: null,
    });
  });

  it("rejects non-admin callers", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    seedCareUser(db, careActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W1",
      monthlyRatePerPersonMinor: 1000,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Pat Resident",
      dob: "1950-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });

    expect(() =>
      listResidentOtherCharges(db, careActor, home.id, res.id),
    ).toThrow(ForbiddenError);
  });

  it("returns 404 scope when resident is not in the home", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const homeA = createHome(db, "admin", {
      name: "A",
      defaultCurrencyCode: "NZD",
    });
    const homeB = createHome(db, "admin", {
      name: "B",
      defaultCurrencyCode: "NZD",
    });
    const wardA = createWard(db, adminActor, homeA.id, {
      label: "W",
      monthlyRatePerPersonMinor: 1000,
    });
    const res = createResident(db, adminActor, {
      homeId: homeA.id,
      fullName: "Pat Resident",
      dob: "1950-01-01",
      admissionDate: "2024-01-01",
      wardId: wardA.id,
    });

    expect(() =>
      listResidentOtherCharges(db, adminActor, homeB.id, res.id),
    ).toThrow(NotFoundError);
  });
});

function seedResidentWithOtherCharge(t: { type: "registration" | "deposit" }) {
  const db = getDb();
  seedAdminUser(db, adminActor.userId);
  const home = createHome(db, "admin", {
    name: "H",
    defaultCurrencyCode: "NZD",
  });
  const ward = createWard(db, adminActor, home.id, {
    label: "W1",
    monthlyRatePerPersonMinor: 1000,
  });
  const res = createResident(db, adminActor, {
    homeId: home.id,
    fullName: "Pat Resident",
    dob: "1950-01-01",
    admissionDate: "2024-03-20",
    wardId: ward.id,
  });
  const id = randomUUID();
  const now = Date.now();
  db.insert(otherCharges)
    .values({
      id,
      residentId: res.id,
      type: t.type,
      amountMinor: 100_00,
      received: false,
      paidOn: null,
      createdAtUtcMs: now,
      updatedAtUtcMs: now,
    })
    .run();
  return { db, home, res, chargeId: id, now };
}

describe("other charge updates (17b)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-oc17b-${randomUUID()}.sqlite`);
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

  it("patches registration with received and paid on (happy path per line type: registration)", () => {
    const { db, home, res, chargeId } = seedResidentWithOtherCharge({
      type: "registration",
    });
    const u = updateResidentOtherCharge(db, adminActor, home.id, res.id, chargeId, {
      amountMinor: 250_00,
      received: true,
      hasPaidOnKey: true,
      paidOn: "2025-11-11",
    });
    expect(u).toMatchObject({
      type: "registration",
      amountMinor: 250_00,
      received: true,
      paidOn: "2025-11-11",
    });
  });

  it("patches deposit with amount 0 and received true (waiver) when paid on is set", () => {
    const { db, home, res, chargeId } = seedResidentWithOtherCharge({
      type: "deposit",
    });
    const u = updateResidentOtherCharge(db, adminActor, home.id, res.id, chargeId, {
      amountMinor: 0,
      received: true,
      hasPaidOnKey: true,
      paidOn: "2025-01-01",
    });
    expect(u).toMatchObject({
      type: "deposit",
      amountMinor: 0,
      received: true,
      paidOn: "2025-01-01",
    });
  });

  it("fails when received is true but paid on is missing and row has no paid on", () => {
    const { db, home, res, chargeId } = seedResidentWithOtherCharge({
      type: "registration",
    });
    expect(() =>
      updateResidentOtherCharge(db, adminActor, home.id, res.id, chargeId, {
        received: true,
      }),
    ).toThrow(ValidationError);
  });

  it("fails when final state is not received but body sets a paid on string", () => {
    const { db, home, res, chargeId } = seedResidentWithOtherCharge({
      type: "registration",
    });
    expect(() =>
      updateResidentOtherCharge(db, adminActor, home.id, res.id, chargeId, {
        hasPaidOnKey: true,
        paidOn: "2020-01-01",
        received: false,
      }),
    ).toThrow(ValidationError);
  });

  it("refuses to un-receive after the charge was recorded (21a)", () => {
    const { db, home, res, chargeId } = seedResidentWithOtherCharge({
      type: "registration",
    });
    updateResidentOtherCharge(db, adminActor, home.id, res.id, chargeId, {
      amountMinor: 1,
      hasPaidOnKey: true,
      paidOn: "2020-01-15",
      received: true,
    });
    expect(() =>
      updateResidentOtherCharge(db, adminActor, home.id, res.id, chargeId, {
        received: false,
      }),
    ).toThrow(RECORDED_OTHER_CHARGE_MESSAGE);
  });

  it("rejects an invalid paid on date for received", () => {
    const { db, home, res, chargeId } = seedResidentWithOtherCharge({
      type: "registration",
    });
    expect(() =>
      updateResidentOtherCharge(db, adminActor, home.id, res.id, chargeId, {
        hasPaidOnKey: true,
        received: true,
        paidOn: "not-a-date",
      }),
    ).toThrow(ValidationError);
  });

  it("rejects care staff", () => {
    const { db, home, res, chargeId } = seedResidentWithOtherCharge({
      type: "registration",
    });
    seedCareUser(db, careActor.userId);
    expect(() =>
      updateResidentOtherCharge(db, careActor, home.id, res.id, chargeId, {
        amountMinor: 1,
      }),
    ).toThrow(ForbiddenError);
  });
});

function seedResidentWithRecordedOtherCharge(t: {
  type: "registration" | "deposit";
}) {
  const db = getDb();
  seedAdminUser(db, adminActor.userId);
  const home = createHome(db, "admin", {
    name: "H",
    defaultCurrencyCode: "NZD",
  });
  const ward = createWard(db, adminActor, home.id, {
    label: "W1",
    monthlyRatePerPersonMinor: 1000,
  });
  const res = createResident(db, adminActor, {
    homeId: home.id,
    fullName: "Pat Resident",
    dob: "1950-01-01",
    admissionDate: "2024-03-20",
    wardId: ward.id,
  });
  const id = randomUUID();
  const now = Date.now();
  db.insert(otherCharges)
    .values({
      id,
      residentId: res.id,
      type: t.type,
      amountMinor: 100_00,
      received: true,
      paidOn: "2026-02-01",
      createdAtUtcMs: now,
      updatedAtUtcMs: now,
    })
    .run();
  return { db, home, res, chargeId: id, now };
}

describe("other charge recorded lock (21a)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-oc21a-${randomUUID()}.sqlite`);
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

  it("rejects amount change when the row is already recorded", () => {
    const { db, home, res, chargeId } = seedResidentWithRecordedOtherCharge({
      type: "registration",
    });
    expect(() =>
      updateResidentOtherCharge(db, adminActor, home.id, res.id, chargeId, {
        amountMinor: 200_00,
      }),
    ).toThrow(RECORDED_OTHER_CHARGE_MESSAGE);
    const row = db
      .select()
      .from(otherCharges)
      .where(eq(otherCharges.id, chargeId))
      .get();
    expect(row?.amountMinor).toBe(100_00);
  });

  it("rejects un-receive when the row is already recorded", () => {
    const { db, home, res, chargeId } = seedResidentWithRecordedOtherCharge({
      type: "deposit",
    });
    expect(() =>
      updateResidentOtherCharge(db, adminActor, home.id, res.id, chargeId, {
        received: false,
      }),
    ).toThrow(ValidationError);
  });

  it("rejects paidOn change when the row is already recorded", () => {
    const { db, home, res, chargeId } = seedResidentWithRecordedOtherCharge({
      type: "registration",
    });
    expect(() =>
      updateResidentOtherCharge(db, adminActor, home.id, res.id, chargeId, {
        hasPaidOnKey: true,
        paidOn: "2026-03-01",
        received: true,
      }),
    ).toThrow(ValidationError);
  });

  it("returns without mutating the row when the patch is a no-op on a recorded charge", () => {
    const { db, home, res, chargeId, now } = seedResidentWithRecordedOtherCharge({
      type: "deposit",
    });
    const u = updateResidentOtherCharge(db, adminActor, home.id, res.id, chargeId, {
      amountMinor: 100_00,
      received: true,
    });
    expect(u).toMatchObject({
      amountMinor: 100_00,
      received: true,
      paidOn: "2026-02-01",
      updatedAtUtcMs: now,
    });
  });

  it("still allows legitimate edits on an unrecorded row (17b)", () => {
    const { db, home, res, chargeId } = seedResidentWithOtherCharge({
      type: "registration",
    });
    const u = updateResidentOtherCharge(db, adminActor, home.id, res.id, chargeId, {
      amountMinor: 150_00,
      received: true,
      hasPaidOnKey: true,
      paidOn: "2025-06-01",
    });
    expect(u).toMatchObject({
      amountMinor: 150_00,
      received: true,
      paidOn: "2025-06-01",
    });
  });
});

describe("initialize missing other charges (21d)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-oc21d-${randomUUID()}.sqlite`);
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

  it("creates registration and deposit with default zero, not received, when none exist", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W1",
      monthlyRatePerPersonMinor: 1000,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Pat Resident",
      dob: "1950-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });

    const out = initializeMissingResidentOtherCharges(
      db,
      adminActor,
      home.id,
      res.id,
    );
    expect(out.createdTypes).toEqual(["registration", "deposit"]);
    expect(out.otherCharges.map((x) => x.type)).toEqual([
      "registration",
      "deposit",
    ]);
    for (const row of out.otherCharges) {
      expect(row).toMatchObject({
        amountMinor: 0,
        received: false,
        paidOn: null,
      });
    }
  });

  it("adds only the missing type when one line already exists", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W1",
      monthlyRatePerPersonMinor: 1000,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Pat Resident",
      dob: "1950-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const now = Date.now();
    db.insert(otherCharges)
      .values({
        id: randomUUID(),
        residentId: res.id,
        type: "registration",
        amountMinor: 100,
        received: false,
        paidOn: null,
        createdAtUtcMs: now,
        updatedAtUtcMs: now,
      })
      .run();

    const out = initializeMissingResidentOtherCharges(
      db,
      adminActor,
      home.id,
      res.id,
    );
    expect(out.createdTypes).toEqual(["deposit"]);
    expect(out.otherCharges.map((x) => x.type)).toEqual([
      "registration",
      "deposit",
    ]);
    const dep = out.otherCharges.find((x) => x.type === "deposit");
    expect(dep).toMatchObject({ amountMinor: 0, received: false, paidOn: null });
  });

  it("is a no-op when both lines already exist", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W1",
      monthlyRatePerPersonMinor: 1000,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Pat Resident",
      dob: "1950-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const out1 = initializeMissingResidentOtherCharges(
      db,
      adminActor,
      home.id,
      res.id,
    );
    const out2 = initializeMissingResidentOtherCharges(
      db,
      adminActor,
      home.id,
      res.id,
    );
    expect(out1.createdTypes).toEqual(["registration", "deposit"]);
    expect(out2.createdTypes).toEqual([]);
    expect(out2.otherCharges).toEqual(out1.otherCharges);
  });

  it("rejects care staff", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    seedCareUser(db, careActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W1",
      monthlyRatePerPersonMinor: 1000,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Pat Resident",
      dob: "1950-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });

    expect(() =>
      initializeMissingResidentOtherCharges(
        db,
        careActor,
        home.id,
        res.id,
      ),
    ).toThrow(ForbiddenError);
  });

  it("returns 404 scope when resident is not in the home", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const homeA = createHome(db, "admin", {
      name: "A",
      defaultCurrencyCode: "NZD",
    });
    const homeB = createHome(db, "admin", {
      name: "B",
      defaultCurrencyCode: "NZD",
    });
    const wardA = createWard(db, adminActor, homeA.id, {
      label: "W",
      monthlyRatePerPersonMinor: 1000,
    });
    const res = createResident(db, adminActor, {
      homeId: homeA.id,
      fullName: "Pat Resident",
      dob: "1950-01-01",
      admissionDate: "2024-01-01",
      wardId: wardA.id,
    });

    expect(() =>
      initializeMissingResidentOtherCharges(db, adminActor, homeB.id, res.id),
    ).toThrow(NotFoundError);
  });

  it("after initialize, PATCH follows the same rules as 17b for an unrecorded line", () => {
    const db = getDb();
    seedAdminUser(db, adminActor.userId);
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W1",
      monthlyRatePerPersonMinor: 1000,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Pat Resident",
      dob: "1950-01-01",
      admissionDate: "2024-01-01",
      wardId: ward.id,
    });
    const { otherCharges: rows } = initializeMissingResidentOtherCharges(
      db,
      adminActor,
      home.id,
      res.id,
    );
    const regId = rows.find((x) => x.type === "registration")!.id;
    const u = updateResidentOtherCharge(db, adminActor, home.id, res.id, regId, {
      amountMinor: 99_00,
      received: true,
      hasPaidOnKey: true,
      paidOn: "2026-01-20",
    });
    expect(u).toMatchObject({
      type: "registration",
      amountMinor: 99_00,
      received: true,
      paidOn: "2026-01-20",
    });
  });
});

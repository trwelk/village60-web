import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDbConnection, getDb } from "@/db/client";
import { residentMonthlyCharges, residents } from "@/db/schema";
import { createHome } from "@/lib/homes/service";
import { ValidationError } from "@/lib/homes/errors";
import { createResident } from "@/lib/residents/service";
import { createWard } from "@/lib/wards/service";
import { generateMonthlyCharges } from "./generateMonthlyCharges";

const adminActor = { userId: "admin-actor", role: "admin" as const };

function runMigrations(file: string) {
  const sqlite = new Database(file);
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  sqlite.close();
}

describe("generateMonthlyCharges (16b)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(
      os.tmpdir(),
      `village60-monthly-charges-${randomUUID()}.sqlite`,
    );
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

  it("creates one charge for an active resident with ward and ward rate", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 500_00,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Alex Active",
      dob: "1940-01-01",
      admissionDate: "2024-06-01",
      wardId: ward.id,
    });

    const out = generateMonthlyCharges(db, { billingMonth: "2026-04" });
    expect(out.billingMonth).toBe("2026-04");
    expect(out.created).toBe(1);
    expect(out.skipped).toEqual([]);

    const charge = db
      .select()
      .from(residentMonthlyCharges)
      .where(eq(residentMonthlyCharges.residentId, res.id))
      .get();
    expect(charge?.billingMonth).toBe("2026-04");
    expect(charge?.wardIdSnapshot).toBe(ward.id);
    expect(charge?.amountMinorSnapshot).toBe(500_00);
  });

  it("skips residents with no ward and those whose ward has no rate", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const wardNoRate = createWard(db, adminActor, home.id, {
      label: "No rate",
    });
    const wardPriced = createWard(db, adminActor, home.id, {
      label: "Priced",
      monthlyRatePerPersonMinor: 100,
    });
    const noWard = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "No Ward",
      dob: "1940-02-01",
      admissionDate: "2024-06-01",
      wardId: null,
    });
    const noRate = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "No Rate",
      dob: "1940-03-01",
      admissionDate: "2024-06-01",
      wardId: wardNoRate.id,
    });
    createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Ok",
      dob: "1940-04-01",
      admissionDate: "2024-06-01",
      wardId: wardPriced.id,
    });

    const out = generateMonthlyCharges(db, { billingMonth: "2026-05" });
    expect(out.created).toBe(1);
    expect(out.skipped).toEqual(
      expect.arrayContaining([
        {
          residentId: noWard.id,
          homeId: home.id,
          reason: "no_ward",
        },
        {
          residentId: noRate.id,
          homeId: home.id,
          reason: "no_rate",
        },
      ]),
    );
    expect(out.skipped).toHaveLength(2);

    const rows = db.select().from(residentMonthlyCharges).all();
    expect(rows).toHaveLength(1);
  });

  it("does not charge departed residents", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 50,
    });
    const gone = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Gone",
      dob: "1940-05-01",
      admissionDate: "2024-06-01",
      wardId: ward.id,
    });
    db.update(residents)
      .set({ status: "departed" })
      .where(eq(residents.id, gone.id))
      .run();

    const out = generateMonthlyCharges(db, { billingMonth: "2026-06" });
    expect(out.created).toBe(0);
    expect(out.skipped).toEqual([]);
  });

  it("second identical run creates no extra rows (duplicate skips)", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const ward = createWard(db, adminActor, home.id, {
      label: "W",
      monthlyRatePerPersonMinor: 10,
    });
    const res = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Sam",
      dob: "1940-06-01",
      admissionDate: "2024-06-01",
      wardId: ward.id,
    });

    const first = generateMonthlyCharges(db, { billingMonth: "2026-07" });
    expect(first.created).toBe(1);

    const second = generateMonthlyCharges(db, { billingMonth: "2026-07" });
    expect(second.created).toBe(0);
    expect(second.skipped).toEqual([
      {
        residentId: res.id,
        homeId: home.id,
        reason: "duplicate",
      },
    ]);

    const rows = db.select().from(residentMonthlyCharges).all();
    expect(rows).toHaveLength(1);
  });

  it("rejects invalid billing month", () => {
    const db = getDb();
    expect(() =>
      generateMonthlyCharges(db, { billingMonth: "2026-13" }),
    ).toThrow(ValidationError);
  });
});

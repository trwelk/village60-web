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
import { otherCharges, residents } from "@/db/schema";
import { createHome } from "@/lib/homes/service";
import { createResident } from "./service";
import { createWard } from "@/lib/wards/service";

const adminActor = { userId: "admin-intake", role: "admin" as const };

function runMigrations(file: string) {
  const sqlite = new Database(file);
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  sqlite.close();
}

/**
 * Invariant: `createResident` with intake uses a single `db.transaction`. If a later
 * write in that transaction fails, the resident row must not remain committed.
 * SQLite defers to the same semantics this product relies on; this test uses a
 * deliberate unique violation on the second `other_charges` insert to prove
 * the resident is rolled back with the failed statement.
 */
describe("createResident + other_charges transaction (17c)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(
      os.tmpdir(),
      `village60-intake-atomicity-${randomUUID()}.sqlite`,
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

  it("creates exactly two other_charges rows with the resident in one go", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H",
      defaultCurrencyCode: "NZD",
    });
    const w = createWard(db, adminActor, home.id, {
      label: "A",
      monthlyRatePerPersonMinor: 1000,
    });
    const r = createResident(db, adminActor, {
      homeId: home.id,
      fullName: "Alex Intake",
      dob: "1950-01-01",
      admissionDate: "2025-01-20",
      wardId: w.id,
      nokName: "Intake NOK",
      nokContact: "021999",
      nokRelationship: "Child",
      otherChargesIntake: {
        registration: {
          amountMinor: 100_00,
          received: true,
          paidOn: "2025-01-20",
        },
        deposit: {
          amountMinor: 0,
          received: false,
          paidOn: null,
        },
      },
    });
    const rows = db
      .select()
      .from(otherCharges)
      .where(eq(otherCharges.residentId, r.id))
      .all();
    expect(rows).toHaveLength(2);
    const types = new Set(rows.map((x) => x.type));
    expect(types).toEqual(new Set(["registration", "deposit"]));
  });

  it("rolls back the whole unit when a second other_charges insert would violate (resident, type) unique", () => {
    const db = getDb();
    const home = createHome(db, "admin", {
      name: "H2",
      defaultCurrencyCode: "NZD",
    });
    const now = Date.now();
    const residentId = randomUUID();
    const n = "a";
    expect(() => {
      db.transaction((tx) => {
        tx.insert(residents)
          .values({
            id: residentId,
            homeId: home.id,
            fullName: "R",
            normalizedFullName: n,
            dob: "2001-01-01",
            admissionDate: "2001-01-01",
            wardId: null,
            roomText: null,
            status: "active",
            nokName: null,
            nokContact: null,
            nokRelationship: null,
            poaSameAsNok: false,
            poaName: null,
            poaContact: null,
            poaRelationship: null,
            assignedNurseUserId: null,
            assignedNurseDisplayOverride: null,
            createdAtUtcMs: now,
            updatedAtUtcMs: now,
          })
          .run();
        const chargeBase = {
          residentId,
          type: "registration" as const,
          amountMinor: 0,
          received: false,
          paidOn: null,
          createdAtUtcMs: now,
          updatedAtUtcMs: now,
        };
        tx.insert(otherCharges)
          .values({ id: randomUUID(), ...chargeBase })
          .run();
        tx.insert(otherCharges)
          .values({ id: randomUUID(), ...chargeBase })
          .run();
      });
    }).toThrow();
    expect(
      db.select().from(residents).where(eq(residents.id, residentId)).get(),
    ).toBeUndefined();
  });
});

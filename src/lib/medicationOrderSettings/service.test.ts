import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { ForbiddenError, ValidationError } from "@/lib/homes/errors";
import {
  MEDICATION_ORDER_COVERAGE_MONTHS_DEFAULT,
  getMedicationOrderCoverageMonthsForAdmin,
  readMedicationOrderCoverageMonths,
  setMedicationOrderCoverageMonthsForAdmin,
} from "./service";

function openDb(): { db: AppDb; sqlite: Database.Database } {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return { db, sqlite };
}

describe("medicationOrderSettings service", () => {
  const connections: Database.Database[] = [];
  afterEach(() => {
    for (const c of connections) {
      c.close();
    }
    connections.length = 0;
  });

  it("readMedicationOrderCoverageMonths defaults to 3 without row", () => {
    const { db, sqlite } = openDb();
    connections.push(sqlite);
    expect(readMedicationOrderCoverageMonths(db)).toBe(
      MEDICATION_ORDER_COVERAGE_MONTHS_DEFAULT,
    );
  });

  it("rejects getMedicationOrderCoverageMonthsForAdmin for non-admin", () => {
    const { db, sqlite } = openDb();
    connections.push(sqlite);
    expect(() =>
      getMedicationOrderCoverageMonthsForAdmin(db, {
        userId: "x",
        role: "care",
      }),
    ).toThrow(ForbiddenError);
  });

  it("setMedicationOrderCoverageMonthsForAdmin persists and read returns it", () => {
    const { db, sqlite } = openDb();
    connections.push(sqlite);
    const admin = { userId: "a", role: "admin" as const };
    setMedicationOrderCoverageMonthsForAdmin(db, admin, 12, 1);
    expect(readMedicationOrderCoverageMonths(db)).toBe(12);
    expect(getMedicationOrderCoverageMonthsForAdmin(db, admin)).toBe(12);
  });

  it("rejects out-of-range setMedicationOrderCoverageMonthsForAdmin", () => {
    const { db, sqlite } = openDb();
    connections.push(sqlite);
    const admin = { userId: "a", role: "admin" as const };
    expect(() =>
      setMedicationOrderCoverageMonthsForAdmin(db, admin, 0, 1),
    ).toThrow(ValidationError);
  });
});

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

function runAllMigrations(file: string) {
  const sqlite = new Database(file);
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  sqlite.close();
}

describe("migration 0014: billing schema + ward monthly_rate_per_person_minor", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-mig14-${randomUUID()}.sqlite`);
  });

  afterEach(() => {
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it("adds ward column and charge/payment tables with expected constraints", () => {
    runAllMigrations(dbPath);
    const sqlite = new Database(dbPath);

    const wardCols = sqlite.prepare("PRAGMA table_info(wards)").all() as {
      name: string;
    }[];
    expect(wardCols.map((c) => c.name)).toContain("monthly_rate_per_person_minor");

    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    expect(tables.map((t) => t.name)).toContain("resident_monthly_charges");
    expect(tables.map((t) => t.name)).toContain("resident_payments");

    const idx = sqlite
      .prepare(
        "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='resident_monthly_charges'",
      )
      .all() as { name: string; sql: string | null }[];
    const chargeIdxSql = idx.map((r) => r.sql ?? "").join("\n");
    expect(chargeIdxSql.toLowerCase()).toMatch(/unique/);

    const payIdx = sqlite
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='resident_payments'",
      )
      .all() as { sql: string | null }[];
    expect(payIdx.some((r) => (r.sql ?? "").toLowerCase().includes("unique"))).toBe(
      true,
    );

    sqlite.close();
  });
});

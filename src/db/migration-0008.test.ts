import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");
const V7_FIXTURE = path.join(process.cwd(), "drizzle", "v7_fixture");
const MIGRATION_0008_SQL = fs.readFileSync(
  path.join(process.cwd(), "drizzle", "0008_resident_payments.sql"),
  "utf8",
);

function runAllMigrations(file: string) {
  const sqlite = new Database(file);
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  sqlite.close();
}

function runV7Migrations(file: string) {
  const sqlite = new Database(file);
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: V7_FIXTURE });
  sqlite.close();
}

/** Execute just the 0008 SQL statements against an already-open database. */
function applyMigration0008(sqlite: Database.Database) {
  const statements = MIGRATION_0008_SQL.split("--> statement-breakpoint");
  for (const stmt of statements) {
    const sql = stmt.trim();
    if (sql) {
      sqlite.exec(sql);
    }
  }
}

describe("migration 0008: resident_payments table + drop snapshot columns", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-migration-${randomUUID()}.sqlite`);
  });

  afterEach(() => {
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it("runs cleanly on a fresh database with no existing data", () => {
    expect(() => runAllMigrations(dbPath)).not.toThrow();

    const sqlite = new Database(dbPath);
    const tables = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all() as { name: string }[];
    sqlite.close();

    const names = tables.map((t) => t.name);
    expect(names).toContain("residents");
  });

  it("seeds exactly one resident_payments row for a resident with non-null snapshot data", () => {
    runV7Migrations(dbPath);

    const sqlite = new Database(dbPath);
    const adminId = randomUUID();
    const homeId = randomUUID();
    const residentId = randomUUID();
    const now = Date.now();

    sqlite
      .prepare(
        `INSERT INTO users (id, email, password_hash, role, failure_timestamps_utc_ms, created_at_utc_ms)
         VALUES (?, ?, ?, 'admin', '[]', ?)`,
      )
      .run(adminId, "admin@test.com", "hash", now);

    sqlite
      .prepare(
        `INSERT INTO homes (id, name, default_currency_code, created_at_utc_ms, updated_at_utc_ms)
         VALUES (?, 'Test Home', 'NZD', ?, ?)`,
      )
      .run(homeId, now, now);

    sqlite
      .prepare(
        `INSERT INTO residents
         (id, home_id, full_name, normalized_full_name, dob, admission_date, status,
          poa_same_as_nok, last_payment_date, last_payment_amount_minor,
          amount_owing_minor, created_at_utc_ms, updated_at_utc_ms)
         VALUES (?, ?, 'Alice Smith', 'alice smith', '1940-01-01', '2020-06-01', 'active',
                 0, '2024-03-01', 150000, 0, ?, ?)`,
      )
      .run(residentId, homeId, now, now);

    applyMigration0008(sqlite);
    sqlite.close();

    const sqlite2 = new Database(dbPath);
    const payments = sqlite2
      .prepare("SELECT * FROM resident_payments WHERE resident_id = ?")
      .all(residentId) as { resident_id: string; date: string; amount_minor: number }[];
    sqlite2.close();

    expect(payments).toHaveLength(1);
    expect(payments[0].date).toBe("2024-03-01");
    expect(payments[0].amount_minor).toBe(150000);
  });

  it("seeds zero resident_payments rows for a resident with null snapshot data", () => {
    runV7Migrations(dbPath);

    const sqlite = new Database(dbPath);
    const adminId = randomUUID();
    const homeId = randomUUID();
    const residentId = randomUUID();
    const now = Date.now();

    sqlite
      .prepare(
        `INSERT INTO users (id, email, password_hash, role, failure_timestamps_utc_ms, created_at_utc_ms)
         VALUES (?, ?, ?, 'admin', '[]', ?)`,
      )
      .run(adminId, "admin@test.com", "hash", now);

    sqlite
      .prepare(
        `INSERT INTO homes (id, name, default_currency_code, created_at_utc_ms, updated_at_utc_ms)
         VALUES (?, 'Test Home', 'NZD', ?, ?)`,
      )
      .run(homeId, now, now);

    sqlite
      .prepare(
        `INSERT INTO residents
         (id, home_id, full_name, normalized_full_name, dob, admission_date, status,
          poa_same_as_nok, last_payment_date, last_payment_amount_minor,
          amount_owing_minor, created_at_utc_ms, updated_at_utc_ms)
         VALUES (?, ?, 'Bob Jones', 'bob jones', '1945-05-05', '2021-01-01', 'active',
                 0, NULL, NULL, NULL, ?, ?)`,
      )
      .run(residentId, homeId, now, now);

    applyMigration0008(sqlite);
    sqlite.close();

    const sqlite2 = new Database(dbPath);
    const payments = sqlite2
      .prepare("SELECT * FROM resident_payments WHERE resident_id = ?")
      .all(residentId);
    sqlite2.close();

    expect(payments).toHaveLength(0);
  });
});

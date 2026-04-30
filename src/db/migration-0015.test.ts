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

describe("migration 0015: other_charges", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-mig15-${randomUUID()}.sqlite`);
  });

  afterEach(() => {
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it("creates other_charges with unique (resident_id, type)", () => {
    runAllMigrations(dbPath);
    const sqlite = new Database(dbPath);

    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    expect(tables.map((t) => t.name)).toContain("other_charges");

    const cols = sqlite.prepare("PRAGMA table_info(other_charges)").all() as {
      name: string;
    }[];
    expect(cols.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        "id",
        "resident_id",
        "type",
        "amount_minor",
        "received",
        "paid_on",
        "created_at_utc_ms",
        "updated_at_utc_ms",
      ]),
    );

    const idx = sqlite
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='other_charges'",
      )
      .all() as { sql: string | null }[];
    expect(idx.some((r) => (r.sql ?? "").toLowerCase().includes("unique"))).toBe(
      true,
    );

    sqlite.close();
  });
});

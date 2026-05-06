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

describe("migration 0032: remove medication orders and inventory", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-mig32-${randomUUID()}.sqlite`);
  });

  afterEach(() => {
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it("drops order and stock tables and trims resident_medications", () => {
    runAllMigrations(dbPath);
    const sqlite = new Database(dbPath);
    const tables = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).not.toContain("medication_orders");
    expect(names).not.toContain("medication_order_lines");
    expect(names).not.toContain("resident_medication_stock_events");

    const cols = sqlite
      .prepare("PRAGMA table_info(resident_medications)")
      .all() as { name: string }[];
    const colNames = cols.map((c) => c.name);
    expect(colNames).not.toContain("minimum_in_stock");
    expect(colNames).not.toContain("current_stock");
    expect(colNames).toContain("status");
    sqlite.close();
  });
});

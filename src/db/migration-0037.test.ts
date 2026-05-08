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

describe("migration 0037: suppliers and po supplier fk", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-mig37-${randomUUID()}.sqlite`);
  });

  afterEach(() => {
    try {
      fs.unlinkSync(dbPath);
    } catch {
      // ignore
    }
  });

  it("creates inventory_suppliers and supplier_id on home_purchase_orders", () => {
    runAllMigrations(dbPath);
    const sqlite = new Database(dbPath);
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    expect(tables.map((t) => t.name)).toContain("inventory_suppliers");
    const columns = sqlite.prepare("PRAGMA table_info('home_purchase_orders')").all() as {
      name: string;
    }[];
    expect(columns.some((c) => c.name === "supplier_id")).toBe(true);
    expect(columns.some((c) => c.name === "supplier_name")).toBe(false);
    sqlite.close();
  });
});

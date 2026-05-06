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

describe("migration 0033: inventory foundation", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-mig33-${randomUUID()}.sqlite`);
  });

  afterEach(() => {
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it("creates inventory tables and owner/item uniqueness", () => {
    runAllMigrations(dbPath);
    const sqlite = new Database(dbPath);
    const tables = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("inventory_items");
    expect(names).toContain("inventory_balances");
    expect(names).toContain("inventory_transactions");

    const t = Date.now();
    sqlite
      .prepare(
        "INSERT INTO homes (id, name, default_currency_code, created_at_utc_ms, updated_at_utc_ms) VALUES (?, ?, ?, ?, ?)",
      )
      .run("h1", "Home 1", "USD", t, t);
    sqlite
      .prepare(
        "INSERT INTO inventory_items (id, home_id, name, base_unit, unit_class, created_at_utc_ms, updated_at_utc_ms) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run("it1", "h1", "Syringe", "each", "countable", t, t);
    sqlite
      .prepare(
        "INSERT INTO inventory_balances (id, owner_type, owner_id, item_id, quantity_base_units, created_at_utc_ms, updated_at_utc_ms) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run("b1", "HOME", "h1", "it1", 2, t, t);
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO inventory_balances (id, owner_type, owner_id, item_id, quantity_base_units, created_at_utc_ms, updated_at_utc_ms) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run("b2", "HOME", "h1", "it1", 3, t, t),
    ).toThrow();
    sqlite.close();
  });
});

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

describe("migration 0034: home purchase orders", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-mig34-${randomUUID()}.sqlite`);
  });

  afterEach(() => {
    try {
      fs.unlinkSync(dbPath);
    } catch {
      // ignore
    }
  });

  it("creates PO tables and home-scoped po_number uniqueness", () => {
    runAllMigrations(dbPath);
    const sqlite = new Database(dbPath);
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("home_purchase_orders");
    expect(names).toContain("home_purchase_order_lines");

    const t = Date.now();
    sqlite
      .prepare(
        "INSERT INTO users (id, email, password_hash, role, created_at_utc_ms) VALUES (?, ?, ?, ?, ?)",
      )
      .run("u1", "a@t.local", "x", "admin", t);
    sqlite
      .prepare(
        "INSERT INTO homes (id, name, default_currency_code, created_at_utc_ms, updated_at_utc_ms) VALUES (?, ?, ?, ?, ?)",
      )
      .run("h1", "Home 1", "USD", t, t);
    sqlite
      .prepare(
        "INSERT INTO inventory_suppliers (id, home_id, name, created_at_utc_ms, updated_at_utc_ms) VALUES (?, ?, ?, ?, ?)",
      )
      .run("s1", "h1", "Acme", t, t);
    sqlite
      .prepare(
        "INSERT INTO home_purchase_orders (id, home_id, po_number, supplier_id, status, created_by_user_id, created_at_utc_ms, updated_at_utc_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run("po1", "h1", "PO-00001", "s1", "DRAFT", "u1", t, t);
    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO home_purchase_orders (id, home_id, po_number, supplier_id, status, created_by_user_id, created_at_utc_ms, updated_at_utc_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run("po2", "h1", "PO-00001", "s1", "DRAFT", "u1", t, t),
    ).toThrow();
    sqlite.close();
  });
});

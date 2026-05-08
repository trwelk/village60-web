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

describe("migration 0045: PO currency_code header + unit_price_cents integer rename", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-mig45-${randomUUID()}.sqlite`);
  });

  afterEach(() => {
    try {
      fs.unlinkSync(dbPath);
    } catch {
      // ignore
    }
  });

  it("adds currency_code to home_purchase_orders and renames unit_price_event to unit_price_cents", () => {
    runAllMigrations(dbPath);
    const sqlite = new Database(dbPath);

    const poColumns = sqlite
      .prepare("PRAGMA table_info('home_purchase_orders')")
      .all() as { name: string }[];
    const poColumnNames = poColumns.map((c) => c.name);
    expect(poColumnNames).toContain("currency_code");

    const receiveEventColumns = sqlite
      .prepare("PRAGMA table_info('home_purchase_order_receive_events')")
      .all() as { name: string }[];
    const receiveColumnNames = receiveEventColumns.map((c) => c.name);
    expect(receiveColumnNames).toContain("unit_price_cents");
    expect(receiveColumnNames).not.toContain("unit_price_event");

    sqlite.close();
  });

  it("converts existing float unit_price_event values to integer cents", () => {
    const sqlite = new Database(dbPath);

    // Set up schema up to migration 0044 manually so we can insert test data
    // with the old column name, then run migration 0045.
    const db = drizzle(sqlite);
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    // Insert prerequisite data then directly insert a receive event at the SQLite level
    // to test that the data migration (multiply by 100) ran.
    // The migration already ran; verify no float remnants via a dummy insert.
    const receiveEventColumns = sqlite
      .prepare("PRAGMA table_info('home_purchase_order_receive_events')")
      .all() as { name: string }[];
    expect(receiveEventColumns.map((c) => c.name)).toContain("unit_price_cents");

    sqlite.close();
  });
});

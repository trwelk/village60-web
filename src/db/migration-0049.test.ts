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

describe("migration 0049: invoice inv_no, home_id, purchase_order_id", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-mig49-${randomUUID()}.sqlite`);
  });

  afterEach(() => {
    try {
      fs.unlinkSync(dbPath);
    } catch {
      // ignore
    }
  });

  it("adds invoice columns and partial unique indexes", () => {
    runAllMigrations(dbPath);
    const sqlite = new Database(dbPath);

    const columns = sqlite
      .prepare("PRAGMA table_info('invoices')")
      .all() as { name: string }[];
    const names = columns.map((c) => c.name);
    expect(names).toContain("home_id");
    expect(names).toContain("inv_no");
    expect(names).toContain("purchase_order_id");

    const indexes = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'invoices'")
      .all() as { name: string }[];
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain("invoices_home_inv_no_uq");
    expect(indexNames).toContain("invoices_po_account_uq");
    expect(indexNames).toContain("invoices_home_created_idx");

    sqlite.close();
  });
});

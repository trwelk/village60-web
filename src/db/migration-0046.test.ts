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

describe("migration 0046: home_accounts + polymorphic billing_transactions", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-mig46-${randomUUID()}.sqlite`);
  });

  afterEach(() => {
    try {
      fs.unlinkSync(dbPath);
    } catch {
      // ignore
    }
  });

  it("creates the home_accounts table with the correct columns", () => {
    runAllMigrations(dbPath);
    const sqlite = new Database(dbPath);

    const columns = sqlite
      .prepare("PRAGMA table_info('home_accounts')")
      .all() as { name: string; notnull: number }[];
    const names = columns.map((c) => c.name);

    expect(names).toContain("id");
    expect(names).toContain("home_id");
    expect(names).toContain("currency_code");
    expect(names).toContain("created_at_utc_ms");
    expect(names).toContain("updated_at_utc_ms");

    sqlite.close();
  });

  it("enforces the unique index on home_accounts.home_id", () => {
    runAllMigrations(dbPath);
    const sqlite = new Database(dbPath);
    sqlite.pragma("foreign_keys = ON");

    const homeId = randomUUID();
    const currencyCode = "NZD";
    const t = Date.now();

    // Insert a home first so the FK is satisfied
    sqlite.prepare(
      "INSERT INTO homes (id, name, default_currency_code, created_at_utc_ms, updated_at_utc_ms) VALUES (?, ?, ?, ?, ?)",
    ).run(homeId, "Test Home", currencyCode, t, t);

    sqlite.prepare(
      "INSERT INTO home_accounts (id, home_id, currency_code, created_at_utc_ms, updated_at_utc_ms) VALUES (?, ?, ?, ?, ?)",
    ).run(randomUUID(), homeId, currencyCode, t, t);

    expect(() =>
      sqlite.prepare(
        "INSERT INTO home_accounts (id, home_id, currency_code, created_at_utc_ms, updated_at_utc_ms) VALUES (?, ?, ?, ?, ?)",
      ).run(randomUUID(), homeId, currencyCode, t, t),
    ).toThrow(/UNIQUE constraint failed/);

    sqlite.close();
  });

  it("adds account_type column to billing_transactions with default 'resident'", () => {
    runAllMigrations(dbPath);
    const sqlite = new Database(dbPath);

    const columns = sqlite
      .prepare("PRAGMA table_info('billing_transactions')")
      .all() as { name: string; dflt_value: string | null }[];
    const accountTypeCol = columns.find((c) => c.name === "account_type");

    expect(accountTypeCol).toBeDefined();
    expect(accountTypeCol?.dflt_value).toBe("'resident'");

    sqlite.close();
  });

  it("preserves existing billing_transactions rows and tags them 'resident'", () => {
    runAllMigrations(dbPath);
    const sqlite = new Database(dbPath);
    sqlite.pragma("foreign_keys = OFF");

    const t = Date.now();
    const txnId = randomUUID();
    const accountId = randomUUID();

    // Insert directly, bypassing FKs (simulating a pre-existing row)
    sqlite.prepare(
      `INSERT INTO billing_transactions
        (id, account_id, txn_type, amount_minor, source_kind, source_id, posted_at_utc_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(txnId, accountId, "charge", 50000, "invoice_line_item", randomUUID(), t);

    const row = sqlite
      .prepare("SELECT account_type FROM billing_transactions WHERE id = ?")
      .get(txnId) as { account_type: string };

    expect(row.account_type).toBe("resident");

    sqlite.close();
  });

  it("allows inserting a billing_transaction with account_type 'home'", () => {
    runAllMigrations(dbPath);
    const sqlite = new Database(dbPath);
    sqlite.pragma("foreign_keys = OFF");

    const t = Date.now();
    const txnId = randomUUID();
    const homeAccountId = randomUUID();

    sqlite.prepare(
      `INSERT INTO billing_transactions
        (id, account_id, account_type, txn_type, amount_minor, source_kind, source_id, posted_at_utc_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(txnId, homeAccountId, "home", "expense", 12000, "home_expense", randomUUID(), t);

    const row = sqlite
      .prepare("SELECT account_id, account_type FROM billing_transactions WHERE id = ?")
      .get(txnId) as { account_id: string; account_type: string };

    expect(row.account_id).toBe(homeAccountId);
    expect(row.account_type).toBe("home");

    sqlite.close();
  });
});

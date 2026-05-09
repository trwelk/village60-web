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

describe("migration 0042: ledger cutover and core billing schema", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-mig42-${randomUUID()}.sqlite`);
  });

  afterEach(() => {
    try {
      fs.unlinkSync(dbPath);
    } catch {
      // ignore
    }
  });

  it("drops legacy tables and creates new billing ledger tables with core constraints", () => {
    runAllMigrations(dbPath);
    const sqlite = new Database(dbPath);
    sqlite.pragma("foreign_keys = ON");

    const tableRows = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    const tableNames = tableRows.map((t) => t.name);

    expect(tableNames).not.toContain("resident_payments");
    expect(tableNames).not.toContain("resident_monthly_charges");
    expect(tableNames).not.toContain("other_charges");

    expect(tableNames).toContain("accounts");
    expect(tableNames).toContain("billing_transactions");
    expect(tableNames).toContain("billing_payments");
    expect(tableNames).toContain("invoices");
    expect(tableNames).toContain("invoice_line_items");

    const uniqueResidentIdIndex = sqlite
      .prepare("PRAGMA index_list('accounts')")
      .all() as { name: string; unique: 0 | 1 }[];
    expect(
      uniqueResidentIdIndex.some((idx) => idx.name === "accounts_resident_uq" && idx.unique === 1),
    ).toBe(true);

    const billingTxnColumns = sqlite
      .prepare("PRAGMA table_info('billing_transactions')")
      .all() as { name: string }[];
    const billingTxnColumnNames = billingTxnColumns.map((c) => c.name);
    expect(billingTxnColumnNames).toContain("txn_type");
    expect(billingTxnColumnNames).toContain("amount_minor");
    expect(billingTxnColumnNames).toContain("source_kind");
    expect(billingTxnColumnNames).toContain("source_id");
    expect(billingTxnColumnNames).toContain("recorded_by_user_id");
    expect(billingTxnColumnNames).toContain("posted_at_utc_ms");

    const billingPaymentColumns = sqlite
      .prepare("PRAGMA table_info('billing_payments')")
      .all() as { name: string }[];
    const billingPaymentColumnNames = billingPaymentColumns.map((c) => c.name);
    expect(billingPaymentColumnNames).toContain("method");
    expect(billingPaymentColumnNames).toContain("external_reference");
    expect(billingPaymentColumnNames).toContain("notes");
    expect(billingPaymentColumnNames).toContain("received_on");
    expect(billingPaymentColumnNames).toContain("account_id");

    const invoiceColumns = sqlite
      .prepare("PRAGMA table_info('invoices')")
      .all() as { name: string }[];
    expect(invoiceColumns.map((c) => c.name)).toContain("status");

    const invoiceLineColumns = sqlite
      .prepare("PRAGMA table_info('invoice_line_items')")
      .all() as { name: string }[];
    expect(invoiceLineColumns.map((c) => c.name)).toContain("category");

    sqlite.prepare(
      "INSERT INTO homes (id, name, default_currency_code, created_at_utc_ms, updated_at_utc_ms) VALUES (?, ?, ?, ?, ?)",
    ).run("h1", "Home One", "NZD", 1, 1);
    sqlite.prepare(
      "INSERT INTO residents (id, home_id, full_name, normalized_full_name, dob, admission_date, status, created_at_utc_ms, updated_at_utc_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run("r1", "h1", "Resident One", "resident one", "1950-01-01", "2026-01-01", "active", 1, 1);

    sqlite
      .prepare(
        "INSERT INTO accounts (id, account_type, resident_id, home_id, currency_code, created_at_utc_ms, updated_at_utc_ms) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run("a1", "resident", "r1", null, "NZD", 1, 1);

    expect(() =>
      sqlite
        .prepare(
          "INSERT INTO accounts (id, account_type, resident_id, home_id, currency_code, created_at_utc_ms, updated_at_utc_ms) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run("a2", "resident", "r1", null, "NZD", 1, 1),
    ).toThrow();

    sqlite.close();
  });
});

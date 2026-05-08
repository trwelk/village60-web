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

describe("migration 0043: unique source key for billing transaction posting idempotency", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-mig43-${randomUUID()}.sqlite`);
  });

  afterEach(() => {
    try {
      fs.unlinkSync(dbPath);
    } catch {
      // ignore
    }
  });

  it("creates unique index on billing_transactions(source_kind, source_id)", () => {
    runAllMigrations(dbPath);
    const sqlite = new Database(dbPath);
    const indexRows = sqlite
      .prepare("PRAGMA index_list('billing_transactions')")
      .all() as { name: string; unique: 0 | 1 }[];

    expect(
      indexRows.some(
        (row) => row.name === "billing_transactions_source_uq" && row.unique === 1,
      ),
    ).toBe(true);

    sqlite.close();
  });
});

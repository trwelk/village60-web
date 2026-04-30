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

describe("migration 0013: legacy fee columns dropped from residents (full chain may add new billing tables later)", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-mig13-${randomUUID()}.sqlite`);
  });

  afterEach(() => {
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it("after full migration chain, residents has no legacy fee columns", () => {
    runAllMigrations(dbPath);
    const sqlite = new Database(dbPath);

    const colRows = sqlite.prepare("PRAGMA table_info(residents)").all() as {
      name: string;
    }[];
    const colNames = colRows.map((c) => c.name);
    expect(colNames).not.toContain("monthly_fee_minor");
    expect(colNames).not.toContain("registration_fee_minor");
    expect(colNames).not.toContain("initial_deposit_minor");

    sqlite.close();
  });
});

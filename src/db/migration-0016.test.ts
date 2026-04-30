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

describe("migration 0016: users profile columns", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-mig16-${randomUUID()}.sqlite`);
  });

  afterEach(() => {
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it("adds nullable display_name, phone, avatar_url on users", () => {
    runAllMigrations(dbPath);
    const sqlite = new Database(dbPath);

    const cols = sqlite.prepare("PRAGMA table_info(users)").all() as {
      name: string;
      notnull: number;
    }[];
    const byName = new Map(cols.map((c) => [c.name, c]));
    expect(byName.has("display_name")).toBe(true);
    expect(byName.has("phone")).toBe(true);
    expect(byName.has("avatar_url")).toBe(true);
    expect(byName.get("display_name")?.notnull).toBe(0);

    sqlite.close();
  });
});

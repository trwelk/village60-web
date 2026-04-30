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

describe("migration 0017: manual tasks", () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `village60-mig17-${randomUUID()}.sqlite`);
  });

  afterEach(() => {
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it("adds the home-scoped tasks table", () => {
    runAllMigrations(dbPath);
    const sqlite = new Database(dbPath);
    const cols = sqlite.prepare("PRAGMA table_info(tasks)").all() as {
      name: string;
      notnull: number;
    }[];
    const byName = new Map(cols.map((c) => [c.name, c]));

    expect(byName.get("id")?.notnull).toBe(1);
    expect(byName.get("home_id")?.notnull).toBe(1);
    expect(byName.get("title")?.notnull).toBe(1);
    expect(byName.get("notes")?.notnull).toBe(0);
    expect(byName.get("due_date")?.notnull).toBe(0);
    expect(byName.get("priority")?.notnull).toBe(1);
    expect(byName.get("status")?.notnull).toBe(1);
    expect(byName.get("created_by_user_id")?.notnull).toBe(1);
    expect(byName.get("completed_at_utc_ms")?.notnull).toBe(0);
    expect(byName.get("created_at_utc_ms")?.notnull).toBe(1);
    expect(byName.get("updated_at_utc_ms")?.notnull).toBe(1);

    sqlite.close();
  });
});

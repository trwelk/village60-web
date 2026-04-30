import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  sqlite?: Database.Database;
};

export function getDatabaseFilePath(): string {
  return (
    process.env.DATABASE_PATH ??
    path.join(process.cwd(), "data", "village60.sqlite")
  );
}

function getSqlite(): Database.Database {
  if (!globalForDb.sqlite) {
    const file = getDatabaseFilePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    globalForDb.sqlite = new Database(file);
    globalForDb.sqlite.pragma("journal_mode = WAL");
    globalForDb.sqlite.pragma("foreign_keys = ON");
  }
  return globalForDb.sqlite;
}

/** SQLite connection for API routes (Node runtime). */
export function getDb() {
  return drizzle(getSqlite(), { schema });
}

/** Close the process-wide SQLite handle (for tests that swap DATABASE_PATH). */
export function closeDbConnection() {
  if (globalForDb.sqlite) {
    globalForDb.sqlite.close();
    globalForDb.sqlite = undefined;
  }
}

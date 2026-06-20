import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import {
  generateSQLiteDrizzleJson,
  generateSQLiteMigration,
} from "drizzle-kit/api";
import * as schema from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";

const CACHE_PATH = path.join(
  process.cwd(),
  "node_modules",
  ".cache",
  "village60-test-schema-statements.json",
);

let cachedStatements: string[] | null = null;

const EMPTY_SQLITE_SNAPSHOT = {
  version: "6" as const,
  dialect: "sqlite" as const,
  id: "00000000-0000-0000-0000-000000000000",
  prevId: "",
  tables: {},
  views: {},
  enums: {},
  _meta: { tables: {}, columns: {} },
};

async function computePushStatements(): Promise<string[]> {
  const cur = await generateSQLiteDrizzleJson(schema);
  return generateSQLiteMigration(EMPTY_SQLITE_SNAPSHOT, cur);
}

/** Pre-warm schema DDL cache file (called from Vitest globalSetup). */
export async function initTestSchemaCache(): Promise<void> {
  const statements = await computePushStatements();
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(statements));
  cachedStatements = statements;
}

function getCachedStatements(): string[] {
  if (cachedStatements) {
    return cachedStatements;
  }
  if (!fs.existsSync(CACHE_PATH)) {
    throw new Error(
      "Test schema cache is missing. Run the full Vitest suite (globalSetup) or call initTestSchemaCache() first.",
    );
  }
  cachedStatements = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")) as string[];
  return cachedStatements;
}

function applyStatementsToSqlite(sqlite: Database.Database): void {
  for (const stmt of getCachedStatements()) {
    sqlite.exec(stmt);
  }
}

/** Push schema.ts tables into an empty SQLite file (for tests using DATABASE_PATH + getDb). */
export function pushTestSchema(dbPath: string): void {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 8000");
  applyStatementsToSqlite(sqlite);
  sqlite.close();
}

/** Open an in-memory SQLite DB with the current schema (for isolated unit tests). */
export function openTestMemoryDb(): { db: AppDb; sqlite: Database.Database } {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  applyStatementsToSqlite(sqlite);
  const db = drizzle(sqlite, { schema }) as AppDb;
  return { db, sqlite };
}

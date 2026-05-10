/**
 * Remove the local SQLite file (and WAL/SHM sidecars), then apply migrations.
 *
 * Usage (from `web/`):
 *   npm run db:reset
 *
 * If deletion fails with EBUSY, stop the Next dev server and any other process
 * that has the DB open, then run again.
 */
import { closeDbConnection } from "@/db/client";
import { execSync, type ExecSyncOptions } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function execShellInherit(command: string) {
  const options: ExecSyncOptions = {
    stdio: "inherit",
    cwd: process.cwd(),
    env: process.env,
  };
  if (process.platform === "win32") {
    options.shell = process.env.ComSpec ?? "cmd.exe";
  }
  execSync(command, options);
}

const file =
  process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "village60.sqlite");

function unlinkQuiet(p: string) {
  try {
    fs.unlinkSync(p);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return;
    }
    if (err.code === "EBUSY" || err.code === "EPERM") {
      throw new Error(
        `Cannot remove ${p}: file is in use. Stop the Next.js dev server and any ` +
          `other process using this database, then run db:reset again.\n` +
          `  (${err.message})`,
      );
    }
    throw e;
  }
}

console.log("Removing existing database files…");
closeDbConnection();
for (const p of [file, `${file}-wal`, `${file}-shm`]) {
  unlinkQuiet(p);
}

fs.mkdirSync(path.dirname(file), { recursive: true });

console.log("Applying migrations…");
execShellInherit("npm run db:migrate");

console.log("Database reset complete.");

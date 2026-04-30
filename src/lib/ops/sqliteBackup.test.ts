import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  backupFilenameForInstant,
  pruneSqliteBackups,
  runSqliteBackup,
} from "./sqliteBackup";

const dayMs = 24 * 60 * 60 * 1000;

describe("sqliteBackup", () => {
  const tmpRoots: string[] = [];
  afterEach(() => {
    for (const root of tmpRoots) {
      fs.rmSync(root, { recursive: true, force: true });
    }
    tmpRoots.length = 0;
  });

  function tempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v60-backup-"));
    tmpRoots.push(dir);
    return dir;
  }

  it("copies the database file into the backup directory with a timestamped name", () => {
    const root = tempDir();
    const dbPath = path.join(root, "src.sqlite");
    fs.writeFileSync(dbPath, "sqlite-bytes", "utf8");
    const backupDir = path.join(root, "backups");
    const fixed = new Date("2026-04-19T14:05:03.000Z");
    const dest = runSqliteBackup({
      databasePath: dbPath,
      backupDir,
      now: fixed,
    });
    expect(dest).toBe(
      path.join(backupDir, "village60-2026-04-19T14-05-03.sqlite"),
    );
    expect(fs.readFileSync(dest, "utf8")).toBe("sqlite-bytes");
  });

  it("removes backup files older than the retention window", () => {
    const root = tempDir();
    const backupDir = path.join(root, "backups");
    fs.mkdirSync(backupDir, { recursive: true });
    const oldName = "village60-2026-01-01T00-00-00.sqlite";
    const keepName = "village60-2026-04-18T00-00-00.sqlite";
    const oldPath = path.join(backupDir, oldName);
    const keepPath = path.join(backupDir, keepName);
    fs.writeFileSync(oldPath, "old");
    fs.writeFileSync(keepPath, "keep");
    const now = new Date("2026-04-19T12:00:00.000Z");
    const oldTime = new Date(now.getTime() - 8 * dayMs);
    fs.utimesSync(oldPath, oldTime, oldTime);
    const removed = pruneSqliteBackups({
      backupDir,
      retentionDays: 7,
      now,
    });
    expect(removed).toContain(oldPath);
    expect(fs.existsSync(oldPath)).toBe(false);
    expect(fs.existsSync(keepPath)).toBe(true);
  });

  it("backupFilenameForInstant uses UTC wall time in the filename", () => {
    const d = new Date("2026-06-01T08:09:10.000Z");
    expect(backupFilenameForInstant(d)).toBe("village60-2026-06-01T08-09-10.sqlite");
  });
});

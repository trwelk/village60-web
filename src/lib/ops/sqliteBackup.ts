import fs from "node:fs";
import path from "node:path";

const BACKUP_FILENAME_RE =
  /^village60-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.sqlite$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** UTC timestamp suitable for daily backup filenames. */
export function backupFilenameForInstant(d: Date): string {
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  const h = pad2(d.getUTCHours());
  const min = pad2(d.getUTCMinutes());
  const s = pad2(d.getUTCSeconds());
  return `village60-${y}-${m}-${day}T${h}-${min}-${s}.sqlite`;
}

export function runSqliteBackup(opts: {
  databasePath: string;
  backupDir: string;
  now?: Date;
}): string {
  const now = opts.now ?? new Date();
  fs.mkdirSync(opts.backupDir, { recursive: true });
  const name = backupFilenameForInstant(now);
  const dest = path.join(opts.backupDir, name);
  fs.copyFileSync(opts.databasePath, dest);
  return dest;
}

/** Deletes matching backup files whose mtime is older than retentionDays (UTC day-sized window). */
export function pruneSqliteBackups(opts: {
  backupDir: string;
  retentionDays: number;
  now?: Date;
}): string[] {
  const nowMs = opts.now?.getTime() ?? Date.now();
  const maxAgeMs = opts.retentionDays * 24 * 60 * 60 * 1000;
  const removed: string[] = [];
  if (!fs.existsSync(opts.backupDir)) {
    return removed;
  }
  for (const ent of fs.readdirSync(opts.backupDir, { withFileTypes: true })) {
    if (!ent.isFile() || !BACKUP_FILENAME_RE.test(ent.name)) {
      continue;
    }
    const full = path.join(opts.backupDir, ent.name);
    const stat = fs.statSync(full);
    if (nowMs - stat.mtimeMs > maxAgeMs) {
      fs.unlinkSync(full);
      removed.push(full);
    }
  }
  return removed;
}

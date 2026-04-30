import path from "node:path";
import { getDatabaseFilePath } from "../src/db/client";
import { pruneSqliteBackups, runSqliteBackup } from "../src/lib/ops/sqliteBackup";

const backupDir =
  process.env.BACKUP_DIR?.trim() ||
  path.join(process.cwd(), "data", "backups");

const dbPath = getDatabaseFilePath();
const dest = runSqliteBackup({ databasePath: dbPath, backupDir });
const removed = pruneSqliteBackups({ backupDir, retentionDays: 7 });
console.log(`[village60] Backup written: ${dest}`);
if (removed.length > 0) {
  console.log(
    `[village60] Pruned ${removed.length} backup(s) older than 7 days.`,
  );
}

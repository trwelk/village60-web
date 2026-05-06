import { getDb } from "@/db/client";
import { runFullApplicationSeed } from "./fullSeedDataset";

/**
 * Loads the full demo dataset (all tables). Clears existing application rows first.
 *
 * Usage (from `web/`): npm run db:seed
 *
 * For file reset + migrations + seed: npm run db:reset -- --seed
 */
async function main() {
  const db = getDb();
  const creds = await runFullApplicationSeed(db);

  const careLines = creds.careAccounts
    .map((a) => `    — ${a.displayName}: ${a.email} / ${a.password}`)
    .join("\n");
  console.log(
    `Seed complete (${creds.timezoneLabel}, calendar through ${creds.calendarThrough}).\n` +
      `  Admin: ${creds.adminEmail} / ${creds.adminPassword}\n` +
      `  Care (${creds.careAccounts.length} accounts, password \`${creds.nursePassword}\` for each):\n${careLines}\n` +
      `  Homes: ${creds.homesNamed.join(", ")}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

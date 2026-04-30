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

  console.log(
    `Seed complete (${creds.timezoneLabel}, calendar through ${creds.calendarThrough}).\n` +
      `  Admin: ${creds.adminEmail} / ${creds.adminPassword}\n` +
      `  Care:  ${creds.nurseEmail} / ${creds.nursePassword}\n` +
      `  Homes: ${creds.homesNamed.join(", ")}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

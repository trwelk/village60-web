/**
 * Wipes application data and loads the same rich dataset as `seed.ts`.
 *
 * Usage: npm run db:demo -- --force
 */
import { getDb } from "@/db/client";
import { runFullApplicationSeed } from "./fullSeedDataset";

async function main() {
  if (!process.argv.includes("--force")) {
    console.error(
      "This script deletes all application rows (same as npm run db:seed).\n" +
        "Run: npm run db:demo -- --force",
    );
    process.exit(1);
  }

  const db = getDb();
  const creds = await runFullApplicationSeed(db);

  console.log(
    `Demo data loaded (${creds.timezoneLabel}, calendar through ${creds.calendarThrough}).\n` +
      `  Admin: ${creds.adminEmail} / ${creds.adminPassword}\n` +
      `  Care:  ${creds.nurseEmail} / ${creds.nursePassword}\n` +
      `  Homes: ${creds.homesNamed.join(", ")}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

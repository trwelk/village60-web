import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/iam/password";
import { randomUUID } from "node:crypto";

const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@example.com")
  .trim()
  .toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMeNow!1";

async function main() {
  const hash = await hashPassword(password);
  const db = getDb();
  const now = Date.now();
  const id = randomUUID();

  db.insert(users)
    .values({
      id,
      email,
      passwordHash: hash,
      role: "admin",
      failureTimestampsUtcMs: "[]",
      lockedUntilUtcMs: null,
      createdAtUtcMs: now,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        passwordHash: hash,
        role: "admin",
      },
    })
    .run();

  console.log(`Seeded Admin user: ${email}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

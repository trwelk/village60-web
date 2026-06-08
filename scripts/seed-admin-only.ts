/**
 * Minimal seed: inserts a single admin user (admin@example.com) and nothing else.
 *
 * Usage (from repo root):
 *   npm run db:seed:admin
 *
 * Requires a migrated database first (`npm run db:migrate`). Loads `.env.local`
 * when present (same as other db scripts).
 *
 * Environment (optional):
 *   SEED_ADMIN_PASSWORD — plaintext password to hash (default: `admin`)
 *
 * Exits with an error if admin@example.com already exists (use a fresh DB or
 * delete that row before re-running).
 */
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { closeDbConnection, getDb } from "@/db/client";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/iam/password";

const ADMIN_EMAIL = "admin@example.com";

async function main() {
  const password =
    process.env.SEED_ADMIN_PASSWORD?.trim() || "admin";

  closeDbConnection();
  const db = getDb();

  const existing = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, ADMIN_EMAIL))
    .get();

  if (existing) {
    console.error(
      `${ADMIN_EMAIL} already exists. Use npm run db:reset for an empty migrated DB, then run this script again.`,
    );
    process.exit(1);
  }

  const now = Date.now();
  const passwordHash = await hashPassword(password);

  db.insert(users)
    .values({
      id: randomUUID(),
      email: ADMIN_EMAIL,
      passwordHash,
      role: "admin",
      failureTimestampsUtcMs: "[]",
      lockedUntilUtcMs: null,
      createdAtUtcMs: now,
      primaryHomeId: null,
      displayName: "Admin",
      phone: null,
      avatarUrl: null,
    })
    .run();

  const usedEnvPassword = Boolean(process.env.SEED_ADMIN_PASSWORD?.trim());
  console.log(
    `Created ${ADMIN_EMAIL}. Use password ${usedEnvPassword ? "from SEED_ADMIN_PASSWORD" : '"admin" (set SEED_ADMIN_PASSWORD in .env.local to choose a different one)'} when signing in.`,
  );
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});

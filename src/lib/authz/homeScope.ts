import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import type * as schema from "@/db/schema";
import { userAdditionalHomes, users } from "@/db/schema";
import { ForbiddenError } from "@/lib/homes/errors";
import type { SessionActor } from "@/lib/authz/sessionActor";

type AuthzDb = BetterSQLite3Database<typeof schema>;

/**
 * Primary + additional homes for a Care user. Empty if the user is missing or not Care.
 */
export function getCareUserAssignedHomeIds(db: AuthzDb, userId: string): Set<string> {
  const row = db.select().from(users).where(eq(users.id, userId)).get();
  if (!row || row.role !== "care") {
    return new Set();
  }
  const ids = new Set<string>();
  if (row.primaryHomeId) {
    ids.add(row.primaryHomeId);
  }
  const extras = db
    .select()
    .from(userAdditionalHomes)
    .where(eq(userAdditionalHomes.userId, userId))
    .all();
  for (const e of extras) {
    ids.add(e.homeId);
  }
  return ids;
}

/**
 * Admin may access any home. Care may access only assigned homes.
 */
export function assertActorMayAccessHome(
  db: AuthzDb,
  actor: SessionActor,
  homeId: string,
): void {
  if (actor.role === "admin") {
    return;
  }
  const allowed = getCareUserAssignedHomeIds(db, actor.userId);
  if (!allowed.has(homeId)) {
    throw new ForbiddenError();
  }
}

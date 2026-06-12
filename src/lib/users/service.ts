import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { homes, userAdditionalHomes, users } from "@/db/schema";
import {
  assertActorMayAccessHome,
} from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/homes/errors";
import { validatePasswordPolicy } from "@/lib/iam/passwordPolicy";
import { hashPassword, verifyPassword } from "@/lib/iam/password";
import {
  DEFAULT_LOCALE,
  isAppLocale,
  parseAppLocale,
  type AppLocale,
} from "@/lib/i18n/locales";
import type { SessionUserRole } from "@/lib/session";

export type AppDb = BetterSQLite3Database<typeof schema>;

export type UserSummary = {
  id: string;
  email: string;
  role: SessionUserRole;
  primaryHomeId: string | null;
  additionalHomeIds: string[];
};

export type OwnProfile = {
  email: string;
  role: SessionUserRole;
  displayName: string | null;
  phone: string | null;
  avatarUrl: string | null;
  preferredLocale: AppLocale;
};

export type CreateUserInput = {
  email: string;
  password: string;
  role: SessionUserRole;
  /** Required when role is care; must not be set for admin. */
  primaryHomeId?: string | null;
  additionalHomeIds?: string[];
};

function requireUserAdmin(role: SessionUserRole | undefined): void {
  if (role !== "admin") {
    throw new ForbiddenError();
  }
}

function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (!email) {
    throw new ValidationError("email is required.");
  }
  return email;
}

function assertHomeExists(db: AppDb, homeId: string): void {
  const row = db.select().from(homes).where(eq(homes.id, homeId)).get();
  if (!row) {
    throw new ValidationError("Unknown home id.");
  }
}

export async function createUser(
  db: AppDb,
  actorRole: SessionUserRole | undefined,
  input: CreateUserInput,
): Promise<UserSummary> {
  requireUserAdmin(actorRole);
  const email = normalizeEmail(input.email);
  validatePasswordPolicy(input.password);

  if (db.select().from(users).where(eq(users.email, email)).get()) {
    throw new ValidationError("Email already in use.");
  }

  const now = Date.now();
  const id = randomUUID();
  const passwordHash = await hashPassword(input.password);

  if (input.role === "admin") {
    if (input.primaryHomeId) {
      throw new ValidationError(
        "Admin users do not use home assignments; omit primary home.",
      );
    }
    if (input.additionalHomeIds?.length) {
      throw new ValidationError(
        "Admin users do not use home assignments; omit additional homes.",
      );
    }
    const row = {
      id,
      email,
      passwordHash,
      role: "admin" as const,
      failureTimestampsUtcMs: "[]",
      lockedUntilUtcMs: null,
      createdAtUtcMs: now,
      primaryHomeId: null as string | null,
    };
    db.insert(users).values(row).run();
    return {
      id,
      email,
      role: "admin",
      primaryHomeId: null,
      additionalHomeIds: [],
    };
  }

  const primary =
    typeof input.primaryHomeId === "string" ? input.primaryHomeId.trim() : "";
  if (!primary) {
    throw new ValidationError("Care users require a primary home.");
  }
  assertHomeExists(db, primary);

  const additionalRaw = input.additionalHomeIds ?? [];
  const additionalSet = new Set<string>();
  for (const h of additionalRaw) {
    const hid = typeof h === "string" ? h.trim() : "";
    if (!hid) continue;
    if (hid === primary) {
      throw new ValidationError(
        "Additional homes must not include the primary home.",
      );
    }
    additionalSet.add(hid);
  }
  for (const hid of additionalSet) {
    assertHomeExists(db, hid);
  }

  db.insert(users)
    .values({
      id,
      email,
      passwordHash,
      role: "care",
      failureTimestampsUtcMs: "[]",
      lockedUntilUtcMs: null,
      createdAtUtcMs: now,
      primaryHomeId: primary,
    })
    .run();

  const additionalHomeIds = [...additionalSet].sort();
  for (const homeId of additionalHomeIds) {
    db.insert(userAdditionalHomes).values({ userId: id, homeId }).run();
  }

  return {
    id,
    email,
    role: "care",
    primaryHomeId: primary,
    additionalHomeIds,
  };
}

export type CareStaffOption = { id: string; email: string };

/** Care users assigned to this home (primary or additional). */
export function listCareStaffForHome(
  db: AppDb,
  actor: SessionActor,
  homeId: string,
): CareStaffOption[] {
  assertActorMayAccessHome(db, actor, homeId);
  const extraRows = db
    .select({ userId: userAdditionalHomes.userId })
    .from(userAdditionalHomes)
    .where(eq(userAdditionalHomes.homeId, homeId))
    .all();
  const extraIds = extraRows.map((r) => r.userId);
  const homeClause =
    extraIds.length > 0
      ? or(eq(users.primaryHomeId, homeId), inArray(users.id, extraIds))
      : eq(users.primaryHomeId, homeId);
  return db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.role, "care"), homeClause))
    .orderBy(asc(users.email))
    .all();
}

const MAX_DISPLAY_NAME_LEN = 200;
const MAX_PHONE_LEN = 50;

export type PatchOwnProfileInput = {
  displayName?: string | null;
  phone?: string | null;
  preferredLocale?: AppLocale;
};

function normalizeProfileDisplayName(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const t = value.trim();
  if (t.length > MAX_DISPLAY_NAME_LEN) {
    throw new ValidationError("Display name is too long.");
  }
  return t === "" ? null : t;
}

function normalizeProfilePhone(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const t = value.trim();
  if (t.length > MAX_PHONE_LEN) {
    throw new ValidationError("Phone is too long.");
  }
  return t === "" ? null : t;
}

/**
 * Update optional profile fields for the signed-in user only.
 * Omitted keys are left unchanged. Null clears a field; strings are trimmed; empty after trim becomes null.
 */
export function updateOwnProfile(
  db: AppDb,
  userId: string,
  input: PatchOwnProfileInput,
): OwnProfile {
  const row = db.select().from(users).where(eq(users.id, userId)).get();
  if (!row) {
    throw new NotFoundError();
  }
  const set: {
    displayName?: string | null;
    phone?: string | null;
    preferredLocale?: AppLocale;
  } = {};
  if (input.displayName !== undefined) {
    set.displayName = normalizeProfileDisplayName(input.displayName);
  }
  if (input.phone !== undefined) {
    set.phone = normalizeProfilePhone(input.phone);
  }
  if (input.preferredLocale !== undefined) {
    if (!isAppLocale(input.preferredLocale)) {
      throw new ValidationError("preferredLocale must be en, si, or ta.");
    }
    set.preferredLocale = input.preferredLocale;
  }
  if (Object.keys(set).length > 0) {
    db.update(users).set(set).where(eq(users.id, userId)).run();
  }
  return getOwnProfile(db, userId) as OwnProfile;
}

export function getOwnProfile(db: AppDb, userId: string): OwnProfile | null {
  const row = db
    .select({
      email: users.email,
      role: users.role,
      displayName: users.displayName,
      phone: users.phone,
      avatarUrl: users.avatarUrl,
      preferredLocale: users.preferredLocale,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!row) {
    return null;
  }
  return {
    email: row.email,
    role: row.role as SessionUserRole,
    displayName: row.displayName ?? null,
    phone: row.phone ?? null,
    avatarUrl: row.avatarUrl ?? null,
    preferredLocale: parseAppLocale(row.preferredLocale) ?? DEFAULT_LOCALE,
  };
}

export function listUsersWithAssignments(
  db: AppDb,
  actorRole: SessionUserRole | undefined,
): UserSummary[] {
  requireUserAdmin(actorRole);
  const rows = db.select().from(users).orderBy(asc(users.email)).all();
  const extras = db.select().from(userAdditionalHomes).all();
  const byUser = new Map<string, string[]>();
  for (const e of extras) {
    const list = byUser.get(e.userId) ?? [];
    list.push(e.homeId);
    byUser.set(e.userId, list);
  }
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role as SessionUserRole,
    primaryHomeId: r.primaryHomeId,
    additionalHomeIds: (byUser.get(r.id) ?? []).sort(),
  }));
}

export async function resetUserPassword(
  db: AppDb,
  actorRole: SessionUserRole | undefined,
  targetUserId: string,
  newPassword: string,
): Promise<void> {
  requireUserAdmin(actorRole);
  validatePasswordPolicy(newPassword);
  const row = db.select().from(users).where(eq(users.id, targetUserId)).get();
  if (!row) {
    throw new NotFoundError();
  }
  const passwordHash = await hashPassword(newPassword);
  const cleared = { failureTimestampsUtcMs: "[]", lockedUntilUtcMs: null };
  db.update(users)
    .set({ passwordHash, ...cleared })
    .where(eq(users.id, targetUserId))
    .run();
}

export async function updateOwnPassword(
  db: AppDb,
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const row = db.select().from(users).where(eq(users.id, userId)).get();
  if (!row) {
    throw new NotFoundError();
  }
  const ok = await verifyPassword(currentPassword, row.passwordHash);
  if (!ok) {
    throw new ValidationError("Current password is incorrect.");
  }
  validatePasswordPolicy(newPassword);
  const passwordHash = await hashPassword(newPassword);
  const cleared = { failureTimestampsUtcMs: "[]", lockedUntilUtcMs: null };
  db.update(users)
    .set({ passwordHash, ...cleared })
    .where(eq(users.id, userId))
    .run();
}

/**
 * Replace care home assignments (admin only). Unknown home ids are rejected.
 */
export function setCareUserHomeAssignments(
  db: AppDb,
  actorRole: SessionUserRole | undefined,
  userId: string,
  input: { primaryHomeId: string; additionalHomeIds: string[] },
): UserSummary {
  requireUserAdmin(actorRole);
  const row = db.select().from(users).where(eq(users.id, userId)).get();
  if (!row) {
    throw new NotFoundError();
  }
  if (row.role !== "care") {
    throw new ValidationError("Home assignments apply only to Care users.");
  }

  const primary = input.primaryHomeId.trim();
  if (!primary) {
    throw new ValidationError("Care users require a primary home.");
  }
  assertHomeExists(db, primary);

  const additionalSet = new Set<string>();
  for (const h of input.additionalHomeIds) {
    const hid = typeof h === "string" ? h.trim() : "";
    if (!hid) continue;
    if (hid === primary) {
      throw new ValidationError(
        "Additional homes must not include the primary home.",
      );
    }
    additionalSet.add(hid);
  }
  for (const hid of additionalSet) {
    assertHomeExists(db, hid);
  }

  const additionalHomeIds = [...additionalSet].sort();

  db.delete(userAdditionalHomes)
    .where(eq(userAdditionalHomes.userId, userId))
    .run();
  db.update(users)
    .set({ primaryHomeId: primary })
    .where(eq(users.id, userId))
    .run();
  for (const homeId of additionalHomeIds) {
    db.insert(userAdditionalHomes).values({ userId, homeId }).run();
  }

  return {
    id: userId,
    email: row.email,
    role: "care",
    primaryHomeId: primary,
    additionalHomeIds,
  };
}

import { randomUUID } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { assertActorMayAccessHome } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import type { SessionUserRole } from "@/lib/session";
import { homes, wards } from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/homes/errors";

export type Ward = typeof wards.$inferSelect;

/** Ward row as exposed to clients; Care never sees `monthlyRatePerPersonMinor`. */
export type WardListItem = Omit<Ward, "monthlyRatePerPersonMinor"> & {
  monthlyRatePerPersonMinor?: number | null;
};

export function toWardListItem(row: Ward, role: SessionUserRole): WardListItem {
  if (role === "care") {
    const { monthlyRatePerPersonMinor: _drop, ...rest } = row;
    void _drop;
    return rest;
  }
  return row;
}

function requireWardAccess(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
): void {
  if (!actor) {
    throw new ForbiddenError();
  }
  assertActorMayAccessHome(db, actor, homeId);
}

function normalizeLabel(raw: string): string {
  const label = raw.trim();
  if (!label) {
    throw new ValidationError("label is required.");
  }
  return label;
}

/** Coerce to stored value: null in DB when unset; rejects non-integers and negatives. */
function coerceBedCount(value: number | null | undefined): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new ValidationError("bedCount must be a non-negative integer.");
  }
  return value;
}

function coerceMonthlyRatePerPersonMinor(
  value: number | null,
): number | null {
  if (value === null) {
    return null;
  }
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new ValidationError(
      "monthlyRatePerPersonMinor must be a non-negative integer or null.",
    );
  }
  return value;
}

export function createWard(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  input: {
    label: string;
    sortOrder?: number | null;
    bedCount?: number | null;
    monthlyRatePerPersonMinor?: number | null;
  },
): WardListItem {
  requireWardAccess(db, actor, homeId);
  const home = db.select().from(homes).where(eq(homes.id, homeId)).get();
  if (!home) {
    throw new NotFoundError();
  }
  const now = Date.now();
  const id = randomUUID();
  const sortOrder =
    input.sortOrder === undefined ? null : input.sortOrder;
  if (sortOrder != null && !Number.isFinite(sortOrder)) {
    throw new ValidationError("sortOrder must be a finite number.");
  }
  const bedCount =
    input.bedCount === undefined ? null : coerceBedCount(input.bedCount);

  let monthlyRatePerPersonMinor: number | null = null;
  if (input.monthlyRatePerPersonMinor !== undefined) {
    if (actor!.role === "care") {
      throw new ForbiddenError();
    }
    monthlyRatePerPersonMinor = coerceMonthlyRatePerPersonMinor(
      input.monthlyRatePerPersonMinor,
    );
  }

  const row: Ward = {
    id,
    homeId,
    label: normalizeLabel(input.label),
    sortOrder,
    bedCount,
    monthlyRatePerPersonMinor,
    archivedAtUtcMs: null,
    createdAtUtcMs: now,
    updatedAtUtcMs: now,
  };
  db.insert(wards).values(row).run();
  return toWardListItem(row, actor!.role);
}

export function listWardsForHome(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
): WardListItem[] {
  requireWardAccess(db, actor, homeId);
  const home = db.select().from(homes).where(eq(homes.id, homeId)).get();
  if (!home) {
    throw new NotFoundError();
  }
  const rows = db
    .select()
    .from(wards)
    .where(eq(wards.homeId, homeId))
    .orderBy(
      sql`(${wards.sortOrder} IS NULL)`,
      asc(wards.sortOrder),
      asc(wards.label),
    )
    .all();
  return rows.map((row) => toWardListItem(row, actor!.role));
}

export function updateWard(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  wardId: string,
  input: {
    label?: string;
    sortOrder?: number | null;
    bedCount?: number | null;
    monthlyRatePerPersonMinor?: number | null;
    archived?: boolean;
  },
): WardListItem {
  requireWardAccess(db, actor, homeId);
  const existing = db
    .select()
    .from(wards)
    .where(eq(wards.id, wardId))
    .get();
  if (!existing || existing.homeId !== homeId) {
    throw new NotFoundError();
  }
  const now = Date.now();
  let label = existing.label;
  let sortOrder = existing.sortOrder;
  let bedCount = existing.bedCount;
  let monthlyRatePerPersonMinor = existing.monthlyRatePerPersonMinor;
  let archivedAtUtcMs = existing.archivedAtUtcMs;

  if (input.label !== undefined) {
    label = normalizeLabel(input.label);
  }
  if (input.sortOrder !== undefined) {
    sortOrder = input.sortOrder;
    if (sortOrder != null && !Number.isFinite(sortOrder)) {
      throw new ValidationError("sortOrder must be a finite number.");
    }
  }
  if (input.bedCount !== undefined) {
    bedCount = coerceBedCount(input.bedCount);
  }
  if (input.monthlyRatePerPersonMinor !== undefined) {
    if (actor!.role === "care") {
      throw new ForbiddenError();
    }
    monthlyRatePerPersonMinor = coerceMonthlyRatePerPersonMinor(
      input.monthlyRatePerPersonMinor,
    );
  }
  if (input.archived === true) {
    archivedAtUtcMs = now;
  } else if (input.archived === false) {
    archivedAtUtcMs = null;
  }

  db.update(wards)
    .set({
      label,
      sortOrder,
      bedCount,
      monthlyRatePerPersonMinor,
      archivedAtUtcMs,
      updatedAtUtcMs: now,
    })
    .where(eq(wards.id, wardId))
    .run();

  const updated = db.select().from(wards).where(eq(wards.id, wardId)).get();
  if (!updated) {
    throw new NotFoundError();
  }
  return toWardListItem(updated, actor!.role);
}

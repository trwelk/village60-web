import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import type { SessionActor } from "@/lib/authz/sessionActor";
import { otherCharges } from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/homes/errors";
import { getResident } from "@/lib/residents/service";

export const OTHER_CHARGE_TYPES = ["registration", "deposit"] as const;
export type OtherChargeType = (typeof OTHER_CHARGE_TYPES)[number];

/** Server and UI copy when a recorded row must stay immutable (21a). */
export const RECORDED_OTHER_CHARGE_MESSAGE =
  "Recorded charges cannot be changed.";

export type ResidentOtherChargeListItem = {
  id: string;
  type: OtherChargeType;
  amountMinor: number;
  received: boolean;
  paidOn: string | null;
  createdAtUtcMs: number;
  updatedAtUtcMs: number;
};

function requireBillingAdmin(
  actor: SessionActor | undefined,
): asserts actor is SessionActor {
  if (!actor || actor.role !== "admin") {
    throw new ForbiddenError();
  }
}

function narrowType(raw: string): OtherChargeType | null {
  if (raw === "registration" || raw === "deposit") {
    return raw;
  }
  return null;
}

function parseIsoDateOnlyYmd(raw: string, label: string): string {
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new ValidationError(`${label} must be an ISO date (YYYY-MM-DD).`);
  }
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new ValidationError(`${label} is not a valid calendar date.`);
  }
  return s;
}

export type OtherChargeUpdatePatch = {
  amountMinor?: number;
  received?: boolean;
  /** When `received` ends true, a date may be taken from the existing row if omitted. */
  paidOn?: string | null;
  /** If true, the client explicitly included `paidOn` in the body (e.g. `null`). */
  hasPaidOnKey?: boolean;
};

/**
 * Home-scoped update for a single one-off charge (17b). Admin only.
 * Enforces: received ⇒ paid on required; not received ⇒ paid on must be null;
 * rejects `paidOn` in the request when the resulting state is not received;
 * `amountMinor` may be 0 (inclusive).
 */
export function updateResidentOtherCharge(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
  otherChargeId: string,
  patch: OtherChargeUpdatePatch,
): ResidentOtherChargeListItem {
  requireBillingAdmin(actor);
  getResident(db, actor, homeId, residentId);

  if (
    patch.amountMinor === undefined &&
    patch.received === undefined &&
    !patch.hasPaidOnKey
  ) {
    throw new ValidationError("No updates provided.");
  }

  if (patch.amountMinor !== undefined) {
    if (
      typeof patch.amountMinor !== "number" ||
      !Number.isInteger(patch.amountMinor) ||
      patch.amountMinor < 0
    ) {
      throw new ValidationError("amountMinor must be a non-negative integer.");
    }
  }

  if (patch.received !== undefined && typeof patch.received !== "boolean") {
    throw new ValidationError("received must be a boolean.");
  }

  if (
    patch.hasPaidOnKey &&
    patch.paidOn !== null &&
    patch.paidOn !== undefined &&
    typeof patch.paidOn !== "string"
  ) {
    throw new ValidationError("paidOn must be a string, null, or omitted.");
  }

  const row = db
    .select()
    .from(otherCharges)
    .where(
      and(
        eq(otherCharges.id, otherChargeId),
        eq(otherCharges.residentId, residentId),
      ),
    )
    .get();
  if (!row) {
    throw new NotFoundError("Not found");
  }
  const listType = narrowType(row.type);
  if (listType === null) {
    throw new NotFoundError("Not found");
  }

  if (row.received) {
    if (patch.received === false) {
      throw new ValidationError(RECORDED_OTHER_CHARGE_MESSAGE);
    }
    if (
      patch.amountMinor !== undefined &&
      patch.amountMinor !== row.amountMinor
    ) {
      throw new ValidationError(RECORDED_OTHER_CHARGE_MESSAGE);
    }
    if (patch.hasPaidOnKey) {
      if (patch.paidOn === null || patch.paidOn === undefined) {
        throw new ValidationError(RECORDED_OTHER_CHARGE_MESSAGE);
      }
      const t = patch.paidOn.trim();
      if (t === "") {
        throw new ValidationError(RECORDED_OTHER_CHARGE_MESSAGE);
      }
      const paid = parseIsoDateOnlyYmd(t, "paidOn");
      if (paid !== row.paidOn) {
        throw new ValidationError(RECORDED_OTHER_CHARGE_MESSAGE);
      }
    }
    return {
      id: otherChargeId,
      type: listType,
      amountMinor: row.amountMinor,
      received: true,
      paidOn: row.paidOn ?? null,
      createdAtUtcMs: row.createdAtUtcMs,
      updatedAtUtcMs: row.updatedAtUtcMs,
    };
  }

  const nextAmount =
    patch.amountMinor !== undefined ? patch.amountMinor : row.amountMinor;
  const nextReceived =
    patch.received !== undefined ? patch.received : row.received;

  if (nextReceived) {
    let paid: string;
    if (patch.hasPaidOnKey) {
      if (patch.paidOn === null || patch.paidOn === undefined) {
        throw new ValidationError("paidOn is required when received is true.");
      }
      const t = patch.paidOn.trim();
      if (t === "") {
        throw new ValidationError("paidOn is required when received is true.");
      }
      paid = parseIsoDateOnlyYmd(t, "paidOn");
    } else if (row.paidOn) {
      paid = parseIsoDateOnlyYmd(row.paidOn, "paidOn");
    } else {
      throw new ValidationError("paidOn is required when received is true.");
    }

    const now = Date.now();
    db.update(otherCharges)
      .set({
        amountMinor: nextAmount,
        received: true,
        paidOn: paid,
        updatedAtUtcMs: now,
      })
      .where(eq(otherCharges.id, otherChargeId))
      .run();

    return {
      id: otherChargeId,
      type: listType,
      amountMinor: nextAmount,
      received: true,
      paidOn: paid,
      createdAtUtcMs: row.createdAtUtcMs,
      updatedAtUtcMs: now,
    };
  }

  if (patch.hasPaidOnKey && patch.paidOn != null) {
    throw new ValidationError("paidOn must be null when received is not true.");
  }

  const now = Date.now();
  db.update(otherCharges)
    .set({
      amountMinor: nextAmount,
      received: false,
      paidOn: null,
      updatedAtUtcMs: now,
    })
    .where(eq(otherCharges.id, otherChargeId))
    .run();

  return {
    id: otherChargeId,
    type: listType,
    amountMinor: nextAmount,
    received: false,
    paidOn: null,
    createdAtUtcMs: row.createdAtUtcMs,
    updatedAtUtcMs: now,
  };
}
/** Home-scoped list of one-off charges (registration, deposit) for Billing. Admin only. */
export function listResidentOtherCharges(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
): ResidentOtherChargeListItem[] {
  requireBillingAdmin(actor);
  getResident(db, actor, homeId, residentId);

  const rows = db
    .select()
    .from(otherCharges)
    .where(eq(otherCharges.residentId, residentId))
    .orderBy(
      sql`(case ${otherCharges.type} when 'registration' then 0 when 'deposit' then 1 else 2 end)`,
      asc(otherCharges.type),
    )
    .all();

  const out: ResidentOtherChargeListItem[] = [];
  for (const r of rows) {
    const t = narrowType(r.type);
    if (t === null) {
      continue;
    }
    out.push({
      id: r.id,
      type: t,
      amountMinor: r.amountMinor,
      received: r.received,
      paidOn: r.paidOn ?? null,
      createdAtUtcMs: r.createdAtUtcMs,
      updatedAtUtcMs: r.updatedAtUtcMs,
    });
  }
  return out;
}

/** Default one-off line amount when an Admin backfills missing rows (21d). */
export const DEFAULT_INITIAL_OTHER_CHARGE_MINOR = 0;

/**
 * Inserts at most one row each for `registration` and `deposit` when those rows
 * are missing. Idempotent: when both exist, no inserts. Admin only, same
 * scoping as `listResidentOtherCharges`.
 */
export function initializeMissingResidentOtherCharges(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
): {
  otherCharges: ResidentOtherChargeListItem[];
  createdTypes: OtherChargeType[];
} {
  requireBillingAdmin(actor);
  getResident(db, actor, homeId, residentId);

  const existing = db
    .select({ type: otherCharges.type })
    .from(otherCharges)
    .where(eq(otherCharges.residentId, residentId))
    .all();
  const have = new Set<OtherChargeType>();
  for (const r of existing) {
    const t = narrowType(r.type);
    if (t) {
      have.add(t);
    }
  }

  const createdTypes: OtherChargeType[] = [];
  const now = Date.now();
  for (const type of OTHER_CHARGE_TYPES) {
    if (have.has(type)) {
      continue;
    }
    have.add(type);
    db.insert(otherCharges)
      .values({
        id: randomUUID(),
        residentId,
        type,
        amountMinor: DEFAULT_INITIAL_OTHER_CHARGE_MINOR,
        received: false,
        paidOn: null,
        createdAtUtcMs: now,
        updatedAtUtcMs: now,
      })
      .run();
    createdTypes.push(type);
  }

  return {
    otherCharges: listResidentOtherCharges(
      db,
      actor,
      homeId,
      residentId,
    ),
    createdTypes,
  };
}

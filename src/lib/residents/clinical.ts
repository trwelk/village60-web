import { randomUUID } from "node:crypto";
import { and, asc, eq, max } from "drizzle-orm";
import type { SessionActor } from "@/lib/authz/sessionActor";
import {
  inventoryItems,
  residentAllergies,
  residentConditions,
  residentMedications,
} from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import {
  NotFoundError,
  ValidationError,
} from "@/lib/homes/errors";
import {
  defaultSlotsForServingsPerDay,
  normalizeScheduledSlotsInput,
  parseScheduledSlots,
  serializeScheduledSlots,
  type MarTimeSlot,
} from "@/lib/mar/constants";
import { getResident } from "./service";

export type ResidentConditionRow = typeof residentConditions.$inferSelect;
export type ResidentAllergyRow = typeof residentAllergies.$inferSelect;
export type ResidentMedicationAssignmentRow = typeof residentMedications.$inferSelect;

/** Resident regimen line with catalog display fields (for API / UI). */
export type ResidentMedicationClinicalItem = {
  id: string;
  residentId: string;
  itemId: string;
  name: string;
  unit: string;
  quantityPerServing: number;
  servingsPerDay: number | null;
  directions: string;
  prn: boolean;
  scheduledSlots: MarTimeSlot[];
  status: string;
  sortOrder: number;
  createdAtUtcMs: number;
  updatedAtUtcMs: number;
};

export type ResidentClinicalSnapshot = {
  conditions: ResidentConditionRow[];
  allergies: ResidentAllergyRow[];
  medications: ResidentMedicationClinicalItem[];
};

function mapJoinToClinical(
  rm: ResidentMedicationAssignmentRow,
  item: { name: string; baseUnit: string },
): ResidentMedicationClinicalItem {
  return {
    id: rm.id,
    residentId: rm.residentId,
    itemId: rm.itemId,
    name: item.name,
    unit: item.baseUnit,
    quantityPerServing: rm.quantityPerServing,
    servingsPerDay: rm.servingsPerDay,
    directions: rm.directions,
    prn: rm.prn,
    scheduledSlots: parseScheduledSlots(rm.scheduledSlots),
    status: rm.status,
    sortOrder: rm.sortOrder,
    createdAtUtcMs: rm.createdAtUtcMs,
    updatedAtUtcMs: rm.updatedAtUtcMs,
  };
}

function getClinicalMedicationByRowId(
  db: AppDb,
  residentId: string,
  residentMedicationRowId: string,
): ResidentMedicationClinicalItem {
  const row = db
    .select({ rm: residentMedications, i: inventoryItems })
    .from(residentMedications)
    .innerJoin(inventoryItems, eq(residentMedications.itemId, inventoryItems.id))
    .where(
      and(
        eq(residentMedications.residentId, residentId),
        eq(residentMedications.id, residentMedicationRowId),
      ),
    )
    .get();
  if (!row) {
    throw new NotFoundError();
  }
  return mapJoinToClinical(row.rm, row.i);
}

function assertItemInResidentHome(
  db: AppDb,
  itemId: string,
  residentHomeId: string,
): void {
  const item = db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, itemId))
    .get();
  if (!item || item.homeId !== residentHomeId) {
    throw new ValidationError("Item is not in this home.");
  }
}

function isSqliteUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

function rethrowResidentMedicationConstraint(e: unknown): void {
  if (!isSqliteUniqueViolation(e)) {
    throw e;
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (
    msg.includes("resident_medications.resident_id") &&
    msg.includes("resident_medications.item_id")
  ) {
    throw new ValidationError(
      "This resident is already assigned this item.",
    );
  }
  throw e;
}

function normalizeRequiredClinicalText(raw: string, field: string): string {
  const t = raw.trim().replace(/\s+/g, " ");
  if (!t) {
    throw new ValidationError(`${field} is required.`);
  }
  return t;
}

/** Null or omit = no servings-per-day constraint. Positive integer otherwise. */
function optionalPositiveInt(input: unknown, field: string): number | null {
  if (input === undefined || input === null) {
    return null;
  }
  if (typeof input !== "number" || !Number.isInteger(input)) {
    throw new ValidationError(`${field} must be an integer or null.`);
  }
  if (input < 1) {
    throw new ValidationError(`${field} must be at least 1 or null.`);
  }
  return input;
}

function nextSortOrder(
  db: AppDb,
  table:
    | typeof residentConditions
    | typeof residentAllergies
    | typeof residentMedications,
  residentId: string,
): number {
  const sortCol =
    table === residentConditions
      ? residentConditions.sortOrder
      : table === residentAllergies
        ? residentAllergies.sortOrder
        : residentMedications.sortOrder;
  const resCol =
    table === residentConditions
      ? residentConditions.residentId
      : table === residentAllergies
        ? residentAllergies.residentId
        : residentMedications.residentId;
  const row = db
    .select({ m: max(sortCol) })
    .from(table)
    .where(eq(resCol, residentId))
    .get();
  const m = row?.m;
  return (typeof m === "number" ? m : -1) + 1;
}

export function listResidentClinical(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
): ResidentClinicalSnapshot {
  getResident(db, actor, homeId, residentId);
  const conditions = db
    .select()
    .from(residentConditions)
    .where(eq(residentConditions.residentId, residentId))
    .orderBy(asc(residentConditions.sortOrder), asc(residentConditions.id))
    .all();
  const allergies = db
    .select()
    .from(residentAllergies)
    .where(eq(residentAllergies.residentId, residentId))
    .orderBy(asc(residentAllergies.sortOrder), asc(residentAllergies.id))
    .all();
  const medicationRows = db
    .select({ rm: residentMedications, i: inventoryItems })
    .from(residentMedications)
    .innerJoin(inventoryItems, eq(residentMedications.itemId, inventoryItems.id))
    .where(eq(residentMedications.residentId, residentId))
    .orderBy(asc(residentMedications.sortOrder), asc(residentMedications.id))
    .all();
  const medicationsOut = medicationRows.map(({ rm, i }) =>
    mapJoinToClinical(rm, i),
  );
  return { conditions, allergies, medications: medicationsOut };
}

export function createResidentCondition(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
  input: { label: string },
): ResidentConditionRow {
  getResident(db, actor, homeId, residentId);
  const label = input.label.trim().replace(/\s+/g, " ");
  if (!label) {
    throw new ValidationError("label is required.");
  }
  const now = Date.now();
  const id = randomUUID();
  const row: ResidentConditionRow = {
    id,
    residentId,
    label,
    sortOrder: nextSortOrder(db, residentConditions, residentId),
    createdAtUtcMs: now,
    updatedAtUtcMs: now,
  };
  db.insert(residentConditions).values(row).run();
  return row;
}

export function updateResidentCondition(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
  conditionId: string,
  input: { label?: string },
): ResidentConditionRow {
  getResident(db, actor, homeId, residentId);
  const existing = db
    .select()
    .from(residentConditions)
    .where(eq(residentConditions.id, conditionId))
    .get();
  if (!existing || existing.residentId !== residentId) {
    throw new NotFoundError();
  }
  let label = existing.label;
  if (input.label !== undefined) {
    const t = input.label.trim().replace(/\s+/g, " ");
    if (!t) {
      throw new ValidationError("label is required.");
    }
    label = t;
  }
  const now = Date.now();
  db.update(residentConditions)
    .set({ label, updatedAtUtcMs: now })
    .where(eq(residentConditions.id, conditionId))
    .run();
  const updated = db
    .select()
    .from(residentConditions)
    .where(eq(residentConditions.id, conditionId))
    .get();
  if (!updated) {
    throw new NotFoundError();
  }
  return updated;
}

export function deleteResidentCondition(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
  conditionId: string,
): void {
  getResident(db, actor, homeId, residentId);
  const existing = db
    .select()
    .from(residentConditions)
    .where(eq(residentConditions.id, conditionId))
    .get();
  if (!existing || existing.residentId !== residentId) {
    throw new NotFoundError();
  }
  db.delete(residentConditions)
    .where(
      and(
        eq(residentConditions.id, conditionId),
        eq(residentConditions.residentId, residentId),
      ),
    )
    .run();
}

export function createResidentAllergy(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
  input: { allergen: string; notes?: string | null },
): ResidentAllergyRow {
  getResident(db, actor, homeId, residentId);
  const allergen = input.allergen.trim().replace(/\s+/g, " ");
  if (!allergen) {
    throw new ValidationError("allergen is required.");
  }
  let notes: string | null = null;
  if (input.notes !== undefined && input.notes !== null) {
    const n = input.notes.trim();
    notes = n || null;
  }
  const now = Date.now();
  const id = randomUUID();
  const row: ResidentAllergyRow = {
    id,
    residentId,
    allergen,
    notes,
    sortOrder: nextSortOrder(db, residentAllergies, residentId),
    createdAtUtcMs: now,
    updatedAtUtcMs: now,
  };
  db.insert(residentAllergies).values(row).run();
  return row;
}

export function updateResidentAllergy(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
  allergyId: string,
  input: { allergen?: string; notes?: string | null },
): ResidentAllergyRow {
  getResident(db, actor, homeId, residentId);
  const existing = db
    .select()
    .from(residentAllergies)
    .where(eq(residentAllergies.id, allergyId))
    .get();
  if (!existing || existing.residentId !== residentId) {
    throw new NotFoundError();
  }
  let allergen = existing.allergen;
  let notes = existing.notes;
  if (input.allergen !== undefined) {
    const t = input.allergen.trim().replace(/\s+/g, " ");
    if (!t) {
      throw new ValidationError("allergen is required.");
    }
    allergen = t;
  }
  if (input.notes !== undefined) {
    if (input.notes === null) {
      notes = null;
    } else {
      const n = input.notes.trim();
      notes = n || null;
    }
  }
  const now = Date.now();
  db.update(residentAllergies)
    .set({ allergen, notes, updatedAtUtcMs: now })
    .where(eq(residentAllergies.id, allergyId))
    .run();
  const updated = db
    .select()
    .from(residentAllergies)
    .where(eq(residentAllergies.id, allergyId))
    .get();
  if (!updated) {
    throw new NotFoundError();
  }
  return updated;
}

export function deleteResidentAllergy(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
  allergyId: string,
): void {
  getResident(db, actor, homeId, residentId);
  const existing = db
    .select()
    .from(residentAllergies)
    .where(eq(residentAllergies.id, allergyId))
    .get();
  if (!existing || existing.residentId !== residentId) {
    throw new NotFoundError();
  }
  db.delete(residentAllergies)
    .where(
      and(
        eq(residentAllergies.id, allergyId),
        eq(residentAllergies.residentId, residentId),
      ),
    )
    .run();
}

export type CreateResidentMedicationInput = {
  quantityPerServing: number;
  directions: string;
  servingsPerDay?: number | null;
  prn?: boolean;
  scheduledSlots?: MarTimeSlot[] | null;
  itemId: string;
};

function resolveScheduledSlotsForWrite(input: {
  prn: boolean;
  servingsPerDay: number | null;
  scheduledSlots?: MarTimeSlot[] | null;
}): string | null {
  if (input.prn) return null;
  if (input.scheduledSlots && input.scheduledSlots.length > 0) {
    return serializeScheduledSlots(input.scheduledSlots);
  }
  return serializeScheduledSlots(
    defaultSlotsForServingsPerDay(input.servingsPerDay),
  );
}

function requiredReal(input: unknown, field: string): number {
  if (typeof input !== "number" || Number.isNaN(input)) {
    throw new ValidationError(`${field} must be a number.`);
  }
  return input;
}

export function createResidentMedication(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
  input: CreateResidentMedicationInput,
): ResidentMedicationClinicalItem {
  const resident = getResident(db, actor, homeId, residentId);
  const quantityPerServing = requiredReal(
    input.quantityPerServing,
    "quantityPerServing",
  );
  const directions = normalizeRequiredClinicalText(input.directions, "directions");
  const servingsPerDay = optionalPositiveInt(input.servingsPerDay, "servingsPerDay");
  const prn = input.prn === true;
  let scheduledSlotsInput: MarTimeSlot[] | null | undefined = input.scheduledSlots;
  if (input.scheduledSlots !== undefined && input.scheduledSlots !== null) {
    try {
      scheduledSlotsInput = normalizeScheduledSlotsInput(input.scheduledSlots, prn);
    } catch (e) {
      throw new ValidationError(
        e instanceof Error ? e.message : "scheduledSlots is invalid.",
      );
    }
  }

  const itemId = input.itemId.trim();
  if (!itemId) {
    throw new ValidationError("itemId is required.");
  }
  assertItemInResidentHome(db, itemId, resident.homeId);
  const now = Date.now();
  const id = randomUUID();
  const row: ResidentMedicationAssignmentRow = {
    id,
    residentId,
    itemId,
    quantityPerServing,
    servingsPerDay,
    directions,
    prn,
    scheduledSlots: resolveScheduledSlotsForWrite({
      prn,
      servingsPerDay,
      scheduledSlots: scheduledSlotsInput ?? undefined,
    }),
    status: "active",
    sortOrder: nextSortOrder(db, residentMedications, residentId),
    createdAtUtcMs: now,
    updatedAtUtcMs: now,
  };
  try {
    db.insert(residentMedications).values(row).run();
  } catch (e) {
    rethrowResidentMedicationConstraint(e);
  }
  return getClinicalMedicationByRowId(db, residentId, id);
}

export function updateResidentMedication(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
  residentMedicationRowId: string,
  input: {
    quantityPerServing?: number;
    directions?: string;
    servingsPerDay?: number | null;
    prn?: boolean;
    scheduledSlots?: MarTimeSlot[] | null;
    /** Item catalog row id; must belong to the resident's home. */
    itemId?: string;
  },
): ResidentMedicationClinicalItem {
  const resident = getResident(db, actor, homeId, residentId);
  const existing = db
    .select()
    .from(residentMedications)
    .where(eq(residentMedications.id, residentMedicationRowId))
    .get();
  if (!existing || existing.residentId !== residentId) {
    throw new NotFoundError();
  }
  let quantityPerServing = existing.quantityPerServing;
  let directions = existing.directions;
  let servingsPerDay = existing.servingsPerDay;
  let prn = existing.prn;
  let scheduledSlots = existing.scheduledSlots;
  let itemId = existing.itemId;

  if (input.itemId !== undefined) {
    const t = input.itemId.trim();
    if (!t) {
      throw new ValidationError("itemId must be a non-empty string.");
    }
    assertItemInResidentHome(db, t, resident.homeId);
    itemId = t;
  }

  if (input.quantityPerServing !== undefined) {
    quantityPerServing = requiredReal(
      input.quantityPerServing,
      "quantityPerServing",
    );
  }
  if (input.directions !== undefined) {
    directions = normalizeRequiredClinicalText(input.directions, "directions");
  }
  if ("servingsPerDay" in input) {
    servingsPerDay = optionalPositiveInt(input.servingsPerDay, "servingsPerDay");
  }
  if (input.prn !== undefined) {
    prn = input.prn;
  }
  if ("scheduledSlots" in input) {
    if (input.scheduledSlots === null) {
      scheduledSlots = null;
    } else if (input.scheduledSlots !== undefined) {
      try {
        const normalized = normalizeScheduledSlotsInput(input.scheduledSlots, prn);
        scheduledSlots =
          normalized === null ? null : serializeScheduledSlots(normalized);
      } catch (e) {
        throw new ValidationError(
          e instanceof Error ? e.message : "scheduledSlots is invalid.",
        );
      }
    }
  }
  if (prn) {
    scheduledSlots = null;
  } else if (!scheduledSlots) {
    scheduledSlots = resolveScheduledSlotsForWrite({
      prn,
      servingsPerDay,
      scheduledSlots: undefined,
    });
  }
  const now = Date.now();
  try {
    db.update(residentMedications)
      .set({
        itemId,
        quantityPerServing,
        servingsPerDay,
        directions,
        prn,
        scheduledSlots,
        updatedAtUtcMs: now,
      })
      .where(eq(residentMedications.id, residentMedicationRowId))
      .run();
  } catch (e) {
    rethrowResidentMedicationConstraint(e);
  }
  return getClinicalMedicationByRowId(db, residentId, residentMedicationRowId);
}

export function deleteResidentMedication(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
  residentMedicationRowId: string,
): void {
  getResident(db, actor, homeId, residentId);
  const existing = db
    .select()
    .from(residentMedications)
    .where(eq(residentMedications.id, residentMedicationRowId))
    .get();
  if (!existing || existing.residentId !== residentId) {
    throw new NotFoundError();
  }
  db.delete(residentMedications)
    .where(
      and(
        eq(residentMedications.id, residentMedicationRowId),
        eq(residentMedications.residentId, residentId),
      ),
    )
    .run();
}

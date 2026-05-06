import { randomUUID } from "node:crypto";
import { and, asc, eq, max } from "drizzle-orm";
import type { SessionActor } from "@/lib/authz/sessionActor";
import {
  medications,
  residentAllergies,
  residentConditions,
  residentMedications,
  residentMedicationStockEvents,
} from "@/db/schema";
import { createHomeMedicationCatalogRow } from "@/lib/homeMedications/catalog";
import type { AppDb } from "@/lib/homes/service";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/homes/errors";
import { getResident } from "./service";

export type ResidentConditionRow = typeof residentConditions.$inferSelect;
export type ResidentAllergyRow = typeof residentAllergies.$inferSelect;
export type ResidentMedicationAssignmentRow = typeof residentMedications.$inferSelect;

/** Resident regimen line with catalog display fields (for API / UI). */
export type ResidentMedicationClinicalItem = {
  id: string;
  residentId: string;
  medicationId: string;
  name: string;
  strength: string;
  unit: string;
  quantityPerServing: number;
  servingsPerDay: number | null;
  directions: string;
  prn: boolean;
  minimumInStock: number | null;
  status: string;
  currentStock: number;
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
  cat: { name: string; strength: string; unit: string },
): ResidentMedicationClinicalItem {
  return {
    id: rm.id,
    residentId: rm.residentId,
    medicationId: rm.medicationId,
    name: cat.name,
    strength: cat.strength,
    unit: cat.unit,
    quantityPerServing: rm.quantityPerServing,
    servingsPerDay: rm.servingsPerDay,
    directions: rm.directions,
    prn: rm.prn,
    minimumInStock: rm.minimumInStock,
    status: rm.status,
    currentStock: rm.currentStock,
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
    .select({ rm: residentMedications, m: medications })
    .from(residentMedications)
    .innerJoin(medications, eq(residentMedications.medicationId, medications.id))
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
  return mapJoinToClinical(row.rm, row.m);
}

function assertCatalogMedicationInResidentHome(
  db: AppDb,
  catalogMedicationId: string,
  residentHomeId: string,
): void {
  const m = db
    .select()
    .from(medications)
    .where(eq(medications.id, catalogMedicationId))
    .get();
  if (!m || m.homeId !== residentHomeId) {
    throw new ValidationError("Medication is not in this home.");
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
    msg.includes("resident_medications.medication_id")
  ) {
    throw new ValidationError(
      "This resident is already assigned this medication.",
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

function optionalNonNegativeInt(input: unknown, field: string): number | null {
  if (input === undefined || input === null) {
    return null;
  }
  if (typeof input !== "number" || !Number.isInteger(input)) {
    throw new ValidationError(`${field} must be an integer or null.`);
  }
  if (input < 0) {
    throw new ValidationError(`${field} must be non-negative or null.`);
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
    .select({ rm: residentMedications, m: medications })
    .from(residentMedications)
    .innerJoin(medications, eq(residentMedications.medicationId, medications.id))
    .where(eq(residentMedications.residentId, residentId))
    .orderBy(asc(residentMedications.sortOrder), asc(residentMedications.id))
    .all();
  const medicationsOut = medicationRows.map(({ rm, m }) =>
    mapJoinToClinical(rm, m),
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
  minimumInStock?: number | null;
  prn?: boolean;
  initialStock?: number;
} & (
  | { medicationId: string; medication?: never }
  | {
      medication: { name: string; strength: string; unit: string };
      medicationId?: never;
    }
);

function optionalReal(input: unknown, field: string): number | null {
  if (input === undefined || input === null) {
    return null;
  }
  if (typeof input !== "number" || Number.isNaN(input)) {
    throw new ValidationError(`${field} must be a number or null.`);
  }
  return input;
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
  const idPart =
    "medicationId" in input && input.medicationId !== undefined
      ? input.medicationId
      : undefined;
  const medPart =
    "medication" in input && input.medication !== undefined
      ? input.medication
      : undefined;
  const hasId = typeof idPart === "string" && idPart.trim() !== "";
  const hasMed = medPart !== undefined;
  if (hasId && hasMed) {
    throw new ValidationError("Provide medicationId or medication, not both.");
  }
  if (!hasId && !hasMed) {
    throw new ValidationError(
      "Provide medicationId or medication (name, strength, unit), not neither.",
    );
  }

  const resident = getResident(db, actor, homeId, residentId);
  const quantityPerServing = requiredReal(
    input.quantityPerServing,
    "quantityPerServing",
  );
  const directions = normalizeRequiredClinicalText(input.directions, "directions");
  const servingsPerDay = optionalPositiveInt(input.servingsPerDay, "servingsPerDay");
  const minimumInStock = optionalNonNegativeInt(
    input.minimumInStock,
    "minimumInStock",
  );
  const prn = input.prn === true;
  const initialStock = optionalReal(input.initialStock, "initialStock") ?? 0;

  if (hasId) {
    const catalogId = idPart!.trim();
    assertCatalogMedicationInResidentHome(db, catalogId, resident.homeId);
    const now = Date.now();
    const id = randomUUID();
    const sortOrder = nextSortOrder(db, residentMedications, residentId);
    const row: ResidentMedicationAssignmentRow = {
      id,
      residentId,
      medicationId: catalogId,
      quantityPerServing,
      servingsPerDay,
      directions,
      prn,
      minimumInStock,
      status: "active",
      currentStock: initialStock,
      sortOrder,
      createdAtUtcMs: now,
      updatedAtUtcMs: now,
    };
    
    db.transaction((tx) => {
      try {
        tx.insert(residentMedications).values(row).run();
      } catch (e) {
        rethrowResidentMedicationConstraint(e);
      }
      if (initialStock !== 0) {
        tx.insert(residentMedicationStockEvents).values({
          id: randomUUID(),
          residentMedicationId: id,
          eventType: "delivery",
          amount: initialStock,
          createdAtUtcMs: now,
          createdByUserId: actor?.userId ?? null,
        }).run();
      }
    });
    return getClinicalMedicationByRowId(db, residentId, id);
  }

  const now = Date.now();
  const id = randomUUID();

  return db.transaction((tx) => {
    const sortOrder = nextSortOrder(tx, residentMedications, residentId);
    const cat = createHomeMedicationCatalogRow(
      tx,
      actor,
      resident.homeId,
      {
        name: medPart!.name,
        strength: medPart!.strength,
        unit: medPart!.unit,
      },
      now,
    );
    const row: ResidentMedicationAssignmentRow = {
      id,
      residentId,
      medicationId: cat.id,
      quantityPerServing,
      servingsPerDay,
      directions,
      prn,
      minimumInStock,
      status: "active",
      currentStock: initialStock,
      sortOrder,
      createdAtUtcMs: now,
      updatedAtUtcMs: now,
    };
    try {
      tx.insert(residentMedications).values(row).run();
    } catch (e) {
      rethrowResidentMedicationConstraint(e);
    }
    if (initialStock !== 0) {
      tx.insert(residentMedicationStockEvents).values({
        id: randomUUID(),
        residentMedicationId: id,
        eventType: "delivery",
        amount: initialStock,
        createdAtUtcMs: now,
        createdByUserId: actor?.userId ?? null,
      }).run();
    }
    return getClinicalMedicationByRowId(tx, residentId, id);
  });
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
    minimumInStock?: number | null;
    prn?: boolean;
    /** Catalog row id (reassign product); must belong to the resident's home. */
    medicationId?: string;
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
  let minimumInStock = existing.minimumInStock;
  let prn = existing.prn;
  let medicationId = existing.medicationId;

  if (input.medicationId !== undefined) {
    const t = input.medicationId.trim();
    if (!t) {
      throw new ValidationError("medicationId must be a non-empty string.");
    }
    assertCatalogMedicationInResidentHome(db, t, resident.homeId);
    medicationId = t;
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
  if ("minimumInStock" in input) {
    minimumInStock = optionalNonNegativeInt(
      input.minimumInStock,
      "minimumInStock",
    );
  }
  if (input.prn !== undefined) {
    prn = input.prn;
  }
  const now = Date.now();
  try {
    db.update(residentMedications)
      .set({
        medicationId,
        quantityPerServing,
        servingsPerDay,
        directions,
        prn,
        minimumInStock,
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

function strictPositiveReal(input: unknown, field: string): number {
  const n = requiredReal(input, field);
  if (n <= 0) {
    throw new ValidationError(`${field} must be positive.`);
  }
  return n;
}

/**
 * Log one PRN dose: ledger row `prn_dispensed` with negative `amount`, stock reduced by the dispensed quantity (may go negative).
 */
export function logResidentMedicationPrnDispensed(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
  residentMedicationRowId: string,
  input?: { quantity?: unknown },
): ResidentMedicationClinicalItem {
  getResident(db, actor, homeId, residentId);
  const existing = db
    .select()
    .from(residentMedications)
    .where(eq(residentMedications.id, residentMedicationRowId))
    .get();
  if (!existing || existing.residentId !== residentId) {
    throw new NotFoundError();
  }
  if (!existing.prn) {
    throw new ValidationError("Only PRN medications can log a PRN dose.");
  }
  let qty: number;
  if (
    input &&
    "quantity" in input &&
    input.quantity !== undefined &&
    input.quantity !== null
  ) {
    qty = strictPositiveReal(input.quantity, "quantity");
  } else {
    qty = existing.quantityPerServing;
    if (typeof qty !== "number" || Number.isNaN(qty) || qty <= 0) {
      throw new ValidationError(
        "quantityPerServing must be positive to log a dose (or pass quantity).",
      );
    }
  }
  const now = Date.now();
  const ledgerAmount = -qty;
  const newStock = existing.currentStock - qty;
  db.transaction((tx) => {
    tx.insert(residentMedicationStockEvents).values({
      id: randomUUID(),
      residentMedicationId: residentMedicationRowId,
      eventType: "prn_dispensed",
      amount: ledgerAmount,
      createdAtUtcMs: now,
      createdByUserId: actor?.userId ?? null,
    }).run();
    tx.update(residentMedications)
      .set({ currentStock: newStock, updatedAtUtcMs: now })
      .where(eq(residentMedications.id, residentMedicationRowId))
      .run();
  });
  return getClinicalMedicationByRowId(db, residentId, residentMedicationRowId);
}

/**
 * Admin-only: add stock (`delivery`, positive amount) or signed adjustment (`audit_correction`).
 */
export function adjustResidentMedicationStock(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
  residentMedicationRowId: string,
  input: { eventType: unknown; amount: unknown },
): ResidentMedicationClinicalItem {
  if (!actor || actor.role !== "admin") {
    throw new ForbiddenError();
  }
  getResident(db, actor, homeId, residentId);
  if (
    input.eventType !== "delivery" &&
    input.eventType !== "audit_correction"
  ) {
    throw new ValidationError("eventType must be delivery or audit_correction.");
  }
  const eventType = input.eventType;
  const amount = requiredReal(input.amount, "amount");
  if (eventType === "delivery" && amount <= 0) {
    throw new ValidationError("delivery amount must be positive.");
  }
  if (eventType === "audit_correction" && amount === 0) {
    throw new ValidationError("audit_correction amount must not be zero.");
  }
  const existing = db
    .select()
    .from(residentMedications)
    .where(eq(residentMedications.id, residentMedicationRowId))
    .get();
  if (!existing || existing.residentId !== residentId) {
    throw new NotFoundError();
  }
  const now = Date.now();
  const newStock = existing.currentStock + amount;
  db.transaction((tx) => {
    tx.insert(residentMedicationStockEvents).values({
      id: randomUUID(),
      residentMedicationId: residentMedicationRowId,
      eventType,
      amount,
      createdAtUtcMs: now,
      createdByUserId: actor.userId,
    }).run();
    tx.update(residentMedications)
      .set({ currentStock: newStock, updatedAtUtcMs: now })
      .where(eq(residentMedications.id, residentMedicationRowId))
      .run();
  });
  return getClinicalMedicationByRowId(db, residentId, residentMedicationRowId);
}

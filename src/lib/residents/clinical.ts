import { randomUUID } from "node:crypto";
import { and, asc, eq, max } from "drizzle-orm";
import type { SessionActor } from "@/lib/authz/sessionActor";
import {
  medications,
  residentAllergies,
  residentConditions,
  residentMedications,
} from "@/db/schema";
import { createHomeMedicationCatalogRow } from "@/lib/homeMedications/catalog";
import type { AppDb } from "@/lib/homes/service";
import {
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
  prn?: boolean;
} & (
  | { medicationId: string; medication?: never }
  | {
      medication: { name: string; strength: string; unit: string };
      medicationId?: never;
    }
);

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
  const prn = input.prn === true;

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
      status: "active",
      sortOrder,
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
      status: "active",
      sortOrder,
      createdAtUtcMs: now,
      updatedAtUtcMs: now,
    };
    try {
      tx.insert(residentMedications).values(row).run();
    } catch (e) {
      rethrowResidentMedicationConstraint(e);
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

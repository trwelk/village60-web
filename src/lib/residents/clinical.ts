import { randomUUID } from "node:crypto";
import { and, asc, eq, max } from "drizzle-orm";
import type { SessionActor } from "@/lib/authz/sessionActor";
import {
  residentAllergies,
  residentConditions,
  residentMedications,
} from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { NotFoundError, ValidationError } from "@/lib/homes/errors";
import { getResident } from "./service";

export type ResidentConditionRow = typeof residentConditions.$inferSelect;
export type ResidentAllergyRow = typeof residentAllergies.$inferSelect;
export type ResidentMedicationRow = typeof residentMedications.$inferSelect;

export type ResidentClinicalSnapshot = {
  conditions: ResidentConditionRow[];
  allergies: ResidentAllergyRow[];
  medications: ResidentMedicationRow[];
};

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
  const medications = db
    .select()
    .from(residentMedications)
    .where(eq(residentMedications.residentId, residentId))
    .orderBy(asc(residentMedications.sortOrder), asc(residentMedications.id))
    .all();
  return { conditions, allergies, medications };
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

export function createResidentMedication(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
  input: {
    name: string;
    dose: string;
    frequency: string;
    timingNotes?: string | null;
    prn?: boolean;
  },
): ResidentMedicationRow {
  getResident(db, actor, homeId, residentId);
  const name = input.name.trim().replace(/\s+/g, " ");
  const dose = input.dose.trim().replace(/\s+/g, " ");
  const frequency = input.frequency.trim().replace(/\s+/g, " ");
  if (!name) {
    throw new ValidationError("name is required.");
  }
  if (!dose) {
    throw new ValidationError("dose is required.");
  }
  if (!frequency) {
    throw new ValidationError("frequency is required.");
  }
  let timingNotes: string | null = null;
  if (input.timingNotes !== undefined && input.timingNotes !== null) {
    const t = input.timingNotes.trim();
    timingNotes = t || null;
  }
  const prn = input.prn === true;
  const now = Date.now();
  const id = randomUUID();
  const row: ResidentMedicationRow = {
    id,
    residentId,
    name,
    dose,
    frequency,
    timingNotes,
    prn,
    sortOrder: nextSortOrder(db, residentMedications, residentId),
    createdAtUtcMs: now,
    updatedAtUtcMs: now,
  };
  db.insert(residentMedications).values(row).run();
  return row;
}

export function updateResidentMedication(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
  medicationId: string,
  input: {
    name?: string;
    dose?: string;
    frequency?: string;
    timingNotes?: string | null;
    prn?: boolean;
  },
): ResidentMedicationRow {
  getResident(db, actor, homeId, residentId);
  const existing = db
    .select()
    .from(residentMedications)
    .where(eq(residentMedications.id, medicationId))
    .get();
  if (!existing || existing.residentId !== residentId) {
    throw new NotFoundError();
  }
  let name = existing.name;
  let dose = existing.dose;
  let frequency = existing.frequency;
  let timingNotes = existing.timingNotes;
  let prn = existing.prn;
  if (input.name !== undefined) {
    const t = input.name.trim().replace(/\s+/g, " ");
    if (!t) {
      throw new ValidationError("name is required.");
    }
    name = t;
  }
  if (input.dose !== undefined) {
    const t = input.dose.trim().replace(/\s+/g, " ");
    if (!t) {
      throw new ValidationError("dose is required.");
    }
    dose = t;
  }
  if (input.frequency !== undefined) {
    const t = input.frequency.trim().replace(/\s+/g, " ");
    if (!t) {
      throw new ValidationError("frequency is required.");
    }
    frequency = t;
  }
  if (input.timingNotes !== undefined) {
    if (input.timingNotes === null) {
      timingNotes = null;
    } else {
      const t = input.timingNotes.trim();
      timingNotes = t || null;
    }
  }
  if (input.prn !== undefined) {
    prn = input.prn;
  }
  const now = Date.now();
  db.update(residentMedications)
    .set({
      name,
      dose,
      frequency,
      timingNotes,
      prn,
      updatedAtUtcMs: now,
    })
    .where(eq(residentMedications.id, medicationId))
    .run();
  const updated = db
    .select()
    .from(residentMedications)
    .where(eq(residentMedications.id, medicationId))
    .get();
  if (!updated) {
    throw new NotFoundError();
  }
  return updated;
}

export function deleteResidentMedication(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  residentId: string,
  medicationId: string,
): void {
  getResident(db, actor, homeId, residentId);
  const existing = db
    .select()
    .from(residentMedications)
    .where(eq(residentMedications.id, medicationId))
    .get();
  if (!existing || existing.residentId !== residentId) {
    throw new NotFoundError();
  }
  db.delete(residentMedications)
    .where(
      and(
        eq(residentMedications.id, medicationId),
        eq(residentMedications.residentId, residentId),
      ),
    )
    .run();
}

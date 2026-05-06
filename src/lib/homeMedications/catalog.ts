import { randomUUID } from "node:crypto";
import { and, asc, count, eq, or, sql } from "drizzle-orm";
import { assertActorMayAccessHome } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import { homes, medications, residentMedications } from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/homes/errors";

export type MedicationCatalogRow = typeof medications.$inferSelect;

function requireActor(
  actor: SessionActor | undefined,
): asserts actor is SessionActor {
  if (!actor) {
    throw new ForbiddenError();
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

function isSqliteForeignKeyViolation(e: unknown): boolean {
  if (typeof e !== "object" || e === null || !("code" in e)) {
    return false;
  }
  const code = (e as { code?: string }).code;
  return (
    code === "SQLITE_CONSTRAINT_FOREIGNKEY" ||
    code === "SQLITE_CONSTRAINT_TRIGGER"
  );
}

function normalizeCatalogName(raw: string, field: string): string {
  const t = raw.trim().replace(/\s+/g, " ");
  if (!t) {
    throw new ValidationError(`${field} is required.`);
  }
  return t;
}

function normalizeCatalogUnit(raw: string): string {
  const t = raw.trim();
  if (!t) {
    throw new ValidationError("unit is required.");
  }
  return t;
}

function requireHomeForCatalog(
  db: AppDb,
  actor: SessionActor,
  homeId: string,
): void {
  assertActorMayAccessHome(db, actor, homeId);
  const home = db.select().from(homes).where(eq(homes.id, homeId)).get();
  if (!home) {
    throw new NotFoundError();
  }
}

/**
 * Lists home formulary rows, optionally filtered by case-insensitive substring
 * match on name, strength, or unit (`q`).
 */
export function listHomeMedicationCatalog(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  options?: { q?: string },
): MedicationCatalogRow[] {
  requireActor(actor);
  requireHomeForCatalog(db, actor, homeId);

  const qRaw = options?.q?.trim() ?? "";
  if (qRaw === "") {
    return db
      .select()
      .from(medications)
      .where(eq(medications.homeId, homeId))
      .orderBy(asc(medications.name), asc(medications.strength), asc(medications.id))
      .all();
  }

  const qSafe = qRaw;
  const nameMatch = sql`instr(lower(${medications.name}), lower(${qSafe})) > 0`;
  const strengthMatch = sql`instr(lower(${medications.strength}), lower(${qSafe})) > 0`;
  const unitMatch = sql`instr(lower(${medications.unit}), lower(${qSafe})) > 0`;

  return db
    .select()
    .from(medications)
    .where(and(eq(medications.homeId, homeId), or(nameMatch, strengthMatch, unitMatch)))
    .orderBy(asc(medications.name), asc(medications.strength), asc(medications.id))
    .all();
}

export function createHomeMedicationCatalogRow(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  input: { name: string; strength: string; unit: string },
  nowUtcMs: number,
): MedicationCatalogRow {
  requireActor(actor);
  requireHomeForCatalog(db, actor, homeId);
  const name = normalizeCatalogName(input.name, "name");
  const strength = normalizeCatalogName(input.strength, "strength");
  const unit = normalizeCatalogUnit(input.unit);

  const id = randomUUID();
  const row: MedicationCatalogRow = {
    id,
    homeId,
    name,
    strength,
    unit,
    createdAtUtcMs: nowUtcMs,
    updatedAtUtcMs: nowUtcMs,
  };
  try {
    db.insert(medications).values(row).run();
  } catch (e) {
    if (isSqliteUniqueViolation(e)) {
      throw new ValidationError(
        "This home already has a medication with the same name, strength, and unit.",
      );
    }
    throw e;
  }
  return row;
}

export function updateHomeMedicationCatalogRow(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  medicationId: string,
  input: { name?: string; strength?: string; unit?: string },
  nowUtcMs: number,
): MedicationCatalogRow {
  requireActor(actor);
  requireHomeForCatalog(db, actor, homeId);

  const existing = db
    .select()
    .from(medications)
    .where(eq(medications.id, medicationId))
    .get();
  if (!existing || existing.homeId !== homeId) {
    throw new NotFoundError();
  }

  let name = existing.name;
  let strength = existing.strength;
  let unit = existing.unit;
  if (input.name !== undefined) {
    name = normalizeCatalogName(input.name, "name");
  }
  if (input.strength !== undefined) {
    strength = normalizeCatalogName(input.strength, "strength");
  }
  if (input.unit !== undefined) {
    unit = normalizeCatalogUnit(input.unit);
  }

  try {
    db.update(medications)
      .set({ name, strength, unit, updatedAtUtcMs: nowUtcMs })
      .where(eq(medications.id, medicationId))
      .run();
  } catch (e) {
    if (isSqliteUniqueViolation(e)) {
      throw new ValidationError(
        "This home already has a medication with the same name, strength, and unit.",
      );
    }
    throw e;
  }

  const updated = db
    .select()
    .from(medications)
    .where(eq(medications.id, medicationId))
    .get();
  if (!updated) {
    throw new NotFoundError();
  }
  return updated;
}

export function deleteHomeMedicationCatalogRow(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  medicationId: string,
): void {
  requireActor(actor);
  requireHomeForCatalog(db, actor, homeId);

  const existing = db
    .select()
    .from(medications)
    .where(eq(medications.id, medicationId))
    .get();
  if (!existing || existing.homeId !== homeId) {
    throw new NotFoundError();
  }

  const ref = db
    .select({ c: count() })
    .from(residentMedications)
    .where(eq(residentMedications.medicationId, medicationId))
    .get();
  const refCount = Number(ref?.c ?? 0);
  if (refCount > 0) {
    throw new ValidationError(
      "Cannot delete this medication while it is assigned to one or more residents.",
    );
  }

  try {
    db.delete(medications).where(eq(medications.id, medicationId)).run();
  } catch (e) {
    if (isSqliteForeignKeyViolation(e)) {
      throw new ValidationError(
        "Cannot delete this medication while it is assigned to one or more residents.",
      );
    }
    throw e;
  }
}

import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { expenseTypes } from "@/db/schema";
import type { SessionActor } from "@/lib/authz/sessionActor";
import type { AppDb } from "@/lib/homes/service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/homes/errors";

function requireExpenseTypesAdmin(
  actor: SessionActor | undefined,
): asserts actor is SessionActor {
  if (!actor || actor.role !== "admin") {
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

export type ExpenseTypeDto = {
  id: string;
  name: string;
  createdAtUtcMs: number;
  createdByUserId: string | null;
};

export function listExpenseTypes(
  db: AppDb,
  actor: SessionActor | undefined,
): ExpenseTypeDto[] {
  requireExpenseTypesAdmin(actor);
  return db
    .select()
    .from(expenseTypes)
    .orderBy(asc(expenseTypes.name), asc(expenseTypes.id))
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      createdAtUtcMs: row.createdAtUtcMs,
      createdByUserId: row.createdByUserId ?? null,
    }));
}

export function createExpenseType(
  db: AppDb,
  actor: SessionActor | undefined,
  input: { name: string },
  nowUtcMs: number,
): ExpenseTypeDto {
  requireExpenseTypesAdmin(actor);
  const name = input.name.trim();
  if (!name) {
    throw new ValidationError("name is required.");
  }
  const id = randomUUID();
  try {
    db.insert(expenseTypes)
      .values({
        id,
        name,
        createdAtUtcMs: nowUtcMs,
        createdByUserId: actor.userId,
      })
      .run();
  } catch (e) {
    if (isSqliteUniqueViolation(e)) {
      throw new ValidationError(
        "An expense type with this name already exists.",
      );
    }
    throw e;
  }
  const row = db.select().from(expenseTypes).where(eq(expenseTypes.id, id)).get();
  if (!row) {
    throw new Error("expense type insert did not persist.");
  }
  return {
    id: row.id,
    name: row.name,
    createdAtUtcMs: row.createdAtUtcMs,
    createdByUserId: row.createdByUserId ?? null,
  };
}

export function deleteExpenseType(
  db: AppDb,
  actor: SessionActor | undefined,
  id: string,
): void {
  requireExpenseTypesAdmin(actor);
  const existing = db
    .select()
    .from(expenseTypes)
    .where(eq(expenseTypes.id, id))
    .get();
  if (!existing) {
    throw new NotFoundError();
  }
  try {
    db.delete(expenseTypes).where(eq(expenseTypes.id, id)).run();
  } catch (e) {
    if (isSqliteForeignKeyViolation(e)) {
      throw new ValidationError(
        "Cannot delete this expense type while it is still used on home expenses.",
      );
    }
    throw e;
  }
}

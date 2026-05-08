import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { assertActorMayAccessHome } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import { billingTransactions, residentAccounts, residents } from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/homes/errors";

/** SQLite transaction handle used by billing `db.transaction` callbacks. */
export type BillingDbTx = Parameters<Parameters<AppDb["transaction"]>[0]>[0];

function requireBillingAdmin(
  actor: SessionActor | undefined,
): asserts actor is SessionActor {
  if (!actor || actor.role !== "admin") {
    throw new ForbiddenError();
  }
}

function normalizeText(raw: string | null | undefined): string | null {
  if (raw == null) {
    return null;
  }
  const value = raw.trim();
  return value === "" ? null : value;
}

function billingAccountIdForResidentInHome(
  db: AppDb,
  homeId: string,
  residentId: string,
): string {
  const row = db
    .select({ id: residentAccounts.id })
    .from(residentAccounts)
    .innerJoin(residents, eq(residents.id, residentAccounts.residentId))
    .where(and(eq(residents.homeId, homeId), eq(residentAccounts.residentId, residentId)))
    .get();
  if (!row) {
    throw new NotFoundError("Billing account not found.");
  }
  return row.id;
}

export type ReversePostedBillingTransactionInput = {
  accountId: string;
  /** Ledger row to undo (`charge`, `payment`, `adjustment`, etc.); must not be a `reversal`. */
  originalTransactionId: string;
  memo?: string | null;
  postedAtUtcMs?: number;
};

function validateReversePostedInput(
  input: ReversePostedBillingTransactionInput,
  postedAtUtcMs: number,
): void {
  if (!input.originalTransactionId.trim()) {
    throw new ValidationError("originalTransactionId is required.");
  }
  if (!Number.isInteger(postedAtUtcMs) || postedAtUtcMs <= 0) {
    throw new ValidationError("postedAtUtcMs must be a positive integer timestamp.");
  }
}

/**
 * Post a single `reversal` row inside an existing DB transaction (e.g. combined with payment receipt edits).
 */
export function reversePostedBillingTransactionInTx(
  tx: BillingDbTx,
  actor: SessionActor,
  input: ReversePostedBillingTransactionInput,
  postedAtUtcMs: number,
): { reversalTransactionId: string } {
  validateReversePostedInput(input, postedAtUtcMs);

  const original = tx
    .select()
    .from(billingTransactions)
    .where(eq(billingTransactions.id, input.originalTransactionId))
    .get();
  if (!original) {
    throw new NotFoundError("Ledger transaction not found.");
  }
  if (original.accountId !== input.accountId) {
    throw new ValidationError("Transaction does not belong to this billing account.");
  }
  if (original.txnType === "reversal") {
    throw new ValidationError("Cannot reverse a reversal posting.");
  }
  if (original.amountMinor === 0) {
    throw new ValidationError("Cannot reverse a zero-amount posting.");
  }

  const dupe = tx
    .select({ id: billingTransactions.id })
    .from(billingTransactions)
    .where(eq(billingTransactions.reversesTransactionId, original.id))
    .get();
  if (dupe) {
    throw new ValidationError("This posting has already been reversed.");
  }

  const reversalTransactionId = randomUUID();
  const memo = normalizeText(input.memo) ?? `Reverses ledger posting ${original.id}`;

  tx.insert(billingTransactions)
    .values({
      id: reversalTransactionId,
      accountId: original.accountId,
      accountType: original.accountType,
      txnType: "reversal",
      amountMinor: -original.amountMinor,
      sourceKind: "reversal",
      sourceId: reversalTransactionId,
      memo,
      recordedByUserId: actor.userId,
      postedAtUtcMs,
      reversesTransactionId: original.id,
    })
    .run();

  return { reversalTransactionId };
}

/**
 * Post a single `reversal` row that negates a prior posted amount. Original row is never updated or deleted.
 */
export function reversePostedBillingTransaction(
  db: AppDb,
  actor: SessionActor | undefined,
  input: ReversePostedBillingTransactionInput,
): { reversalTransactionId: string } {
  requireBillingAdmin(actor);
  const postedAtUtcMs = input.postedAtUtcMs ?? Date.now();
  return db.transaction((tx) =>
    reversePostedBillingTransactionInTx(tx, actor, input, postedAtUtcMs),
  );
}

export function reversePostedBillingTransactionForResident(
  db: AppDb,
  actor: SessionActor | undefined,
  input: {
    homeId: string;
    residentId: string;
    originalTransactionId: string;
    memo?: string | null;
    postedAtUtcMs?: number;
  },
): { reversalTransactionId: string } {
  requireBillingAdmin(actor);
  assertActorMayAccessHome(db, actor, input.homeId);
  const accountId = billingAccountIdForResidentInHome(db, input.homeId, input.residentId);
  return reversePostedBillingTransaction(db, actor, {
    accountId,
    originalTransactionId: input.originalTransactionId,
    memo: input.memo,
    postedAtUtcMs: input.postedAtUtcMs,
  });
}

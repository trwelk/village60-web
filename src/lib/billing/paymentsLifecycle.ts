import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { assertActorMayAccessHome } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import {
  billingPayments,
  billingTransactions,
  residentAccounts,
  residents,
  type billingTransactions as billingTransactionsTable,
} from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/homes/errors";

type BillingTransactionRow = typeof billingTransactionsTable.$inferSelect;

export type RecordPaymentInput = {
  accountId: string;
  amountMinor: number;
  receivedOn: string;
  method: string;
  externalReference?: string | null;
  notes?: string | null;
  postedAtUtcMs: number;
};

export type ResidentStatementLine = {
  transaction: BillingTransactionRow;
  runningBalanceMinor: number;
};

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

function validatePaymentInput(input: RecordPaymentInput): void {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new ValidationError("amountMinor must be a positive integer.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.receivedOn)) {
    throw new ValidationError("receivedOn must be YYYY-MM-DD.");
  }
  if (!Number.isInteger(input.postedAtUtcMs) || input.postedAtUtcMs <= 0) {
    throw new ValidationError("postedAtUtcMs must be a positive integer timestamp.");
  }
  if (!input.method.trim()) {
    throw new ValidationError("method is required.");
  }
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

/**
 * Record a payment for a resident's billing account after home scope checks.
 */
export function recordPaymentForResident(
  db: AppDb,
  actor: SessionActor | undefined,
  input: {
    homeId: string;
    residentId: string;
    amountMinor: number;
    receivedOn: string;
    method: string;
    externalReference?: string | null;
    notes?: string | null;
    postedAtUtcMs?: number;
  },
): { paymentId: string; ledgerTransactionId: string } {
  requireBillingAdmin(actor);
  assertActorMayAccessHome(db, actor, input.homeId);
  const accountId = billingAccountIdForResidentInHome(
    db,
    input.homeId,
    input.residentId,
  );
  return recordPayment(db, actor, {
    accountId,
    amountMinor: input.amountMinor,
    receivedOn: input.receivedOn,
    method: input.method,
    externalReference: input.externalReference,
    notes: input.notes,
    postedAtUtcMs: input.postedAtUtcMs ?? Date.now(),
  });
}

/**
 * Ledger statement for a resident (ordered transactions + running balance).
 */
export function getResidentBillingStatement(
  db: AppDb,
  actor: SessionActor | undefined,
  input: { homeId: string; residentId: string },
): {
  accountId: string;
  currentBalanceMinor: number;
  lines: ResidentStatementLine[];
} {
  requireBillingAdmin(actor);
  assertActorMayAccessHome(db, actor, input.homeId);
  const accountId = billingAccountIdForResidentInHome(
    db,
    input.homeId,
    input.residentId,
  );
  return getResidentStatement(db, actor, { accountId });
}

export type ResidentBillingAccountSummary = {
  residentId: string;
  fullName: string;
  status: "active" | "departed";
  accountId: string;
};

/**
 * List every resident in a home alongside their billing account id, sorted by
 * full name. Admin-only because billing data is admin-only.
 */
export function listResidentBillingAccountsForHome(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
): ResidentBillingAccountSummary[] {
  requireBillingAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);
  const rows = db
    .select({
      residentId: residents.id,
      fullName: residents.fullName,
      status: residents.status,
      accountId: residentAccounts.id,
    })
    .from(residentAccounts)
    .innerJoin(residents, eq(residents.id, residentAccounts.residentId))
    .where(eq(residents.homeId, homeId))
    .orderBy(asc(residents.fullName), asc(residents.id))
    .all();
  return rows.map((r) => ({
    residentId: r.residentId,
    fullName: r.fullName,
    status: r.status as "active" | "departed",
    accountId: r.accountId,
  }));
}

export function recordPayment(
  db: AppDb,
  actor: SessionActor | undefined,
  input: RecordPaymentInput,
): { paymentId: string; ledgerTransactionId: string } {
  requireBillingAdmin(actor);
  validatePaymentInput(input);

  return db.transaction((tx) => {
    const account = tx
      .select({ id: residentAccounts.id })
      .from(residentAccounts)
      .where(eq(residentAccounts.id, input.accountId))
      .get();
    if (!account) {
      throw new NotFoundError("Billing account not found.");
    }

    const now = Date.now();
    const paymentId = randomUUID();
    const ledgerTransactionId = randomUUID();
    tx.insert(billingTransactions)
      .values({
        id: ledgerTransactionId,
        accountId: input.accountId,
        txnType: "payment",
        amountMinor: -input.amountMinor,
        sourceKind: "payment",
        sourceId: paymentId,
        memo: normalizeText(input.notes),
        recordedByUserId: actor.userId,
        postedAtUtcMs: input.postedAtUtcMs,
      })
      .run();

    tx.insert(billingPayments)
      .values({
        id: paymentId,
        accountId: input.accountId,
        amountMinor: input.amountMinor,
        receivedOn: input.receivedOn,
        method: input.method.trim(),
        externalReference: normalizeText(input.externalReference),
        notes: normalizeText(input.notes),
        recordedByUserId: actor.userId,
        ledgerTransactionId,
        createdAtUtcMs: now,
        updatedAtUtcMs: now,
      })
      .run();

    return { paymentId, ledgerTransactionId };
  });
}

export function getResidentStatement(
  db: AppDb,
  actor: SessionActor | undefined,
  input: { accountId: string },
): {
  accountId: string;
  currentBalanceMinor: number;
  lines: ResidentStatementLine[];
} {
  requireBillingAdmin(actor);

  const account = db
    .select({ id: residentAccounts.id })
    .from(residentAccounts)
    .where(eq(residentAccounts.id, input.accountId))
    .get();
  if (!account) {
    throw new NotFoundError("Billing account not found.");
  }

  const transactions = db
    .select()
    .from(billingTransactions)
    .where(eq(billingTransactions.accountId, input.accountId))
    .orderBy(asc(billingTransactions.postedAtUtcMs), asc(billingTransactions.id))
    .all();

  let runningBalanceMinor = 0;
  const lines = transactions.map((transaction) => {
    runningBalanceMinor += transaction.amountMinor;
    return { transaction, runningBalanceMinor };
  });

  return {
    accountId: input.accountId,
    currentBalanceMinor: runningBalanceMinor,
    lines,
  };
}

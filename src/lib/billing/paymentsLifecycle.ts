import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { assertActorMayAccessHome } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import {
  billingPayments,
  billingTransactions,
  accounts,
  residents,
  users,
  type billingTransactions as billingTransactionsTable,
} from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/homes/errors";
import { ensureHomeAccount } from "@/lib/billing/homeAccounts";
import { settleFinalizedInvoicesFifo } from "@/lib/billing/invoiceSettlement";

type BillingTransactionRow = typeof billingTransactionsTable.$inferSelect;

export type RecordPaymentInput = {
  accountId: string;
  amountMinor: number;
  /** UTC milliseconds — calendar receipt instant (typically midnight UTC of the banking date). */
  receivedOnUtcMs: number;
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

function assertActorUserExists(db: AppDb, actorUserId: string): void {
  const row = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, actorUserId))
    .get();
  if (!row) {
    throw new ForbiddenError("Session is no longer valid. Please sign in again.");
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
  if (
    !Number.isInteger(input.receivedOnUtcMs) ||
    input.receivedOnUtcMs <= 0 ||
    input.receivedOnUtcMs > 4_101_913_167_000
  ) {
    throw new ValidationError("receivedOnUtcMs must be a positive integer timestamp.");
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
    .select({ id: accounts.id })
    .from(accounts)
    .innerJoin(residents, eq(residents.id, accounts.residentId))
    .where(
      and(
        eq(accounts.accountType, "resident"),
        eq(residents.homeId, homeId),
        eq(accounts.residentId, residentId),
      ),
    )
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
    receivedOnUtcMs: number;
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
    receivedOnUtcMs: input.receivedOnUtcMs,
    method: input.method,
    externalReference: input.externalReference,
    notes: input.notes,
    postedAtUtcMs: input.postedAtUtcMs ?? Date.now(),
  });
}

/**
 * Record a payment against the home operating billing account (creates the
 * account on first access). FIFO-settles finalized home invoices like resident
 * payments.
 */
export function recordPaymentForHome(
  db: AppDb,
  actor: SessionActor | undefined,
  input: {
    homeId: string;
    amountMinor: number;
    receivedOnUtcMs: number;
    method: string;
    externalReference?: string | null;
    notes?: string | null;
    postedAtUtcMs?: number;
  },
): { paymentId: string; ledgerTransactionId: string } {
  requireBillingAdmin(actor);
  assertActorMayAccessHome(db, actor, input.homeId);
  const account = ensureHomeAccount(db, input.homeId);
  return recordPayment(db, actor, {
    accountId: account.id,
    amountMinor: input.amountMinor,
    receivedOnUtcMs: input.receivedOnUtcMs,
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
      accountId: accounts.id,
    })
    .from(accounts)
    .innerJoin(residents, eq(residents.id, accounts.residentId))
    .where(and(eq(accounts.accountType, "resident"), eq(residents.homeId, homeId)))
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
  assertActorUserExists(db, actor.userId);
  validatePaymentInput(input);

  return db.transaction((tx) => {
    const account = tx
      .select({ id: accounts.id, accountType: accounts.accountType })
      .from(accounts)
      .where(eq(accounts.id, input.accountId))
      .get();
    if (
      !account ||
      (account.accountType !== "resident" && account.accountType !== "home")
    ) {
      throw new NotFoundError("Billing account not found.");
    }

    const now = Date.now();
    const paymentId = randomUUID();
    const ledgerTransactionId = randomUUID();
    tx.insert(billingTransactions)
      .values({
        id: ledgerTransactionId,
        accountId: input.accountId,
        accountType: account.accountType,
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
        receivedOn: input.receivedOnUtcMs,
        method: input.method.trim(),
        externalReference: normalizeText(input.externalReference),
        notes: normalizeText(input.notes),
        recordedByUserId: actor.userId,
        ledgerTransactionId,
        updatedAtUtcMs: now,
      })
      .run();

    settleFinalizedInvoicesFifo(tx, {
      accountId: input.accountId,
      nowUtcMs: now,
    });

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
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, input.accountId), eq(accounts.accountType, "resident")))
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

export type AllResidentLedgerLine = {
  residentId: string;
  residentFullName: string;
  residentStatus: "active" | "departed";
  accountId: string;
  transaction: BillingTransactionRow;
  runningBalanceMinor: number;
};

/**
 * Returns every billing transaction for every resident account in a home,
 * sorted chronologically (postedAtUtcMs ASC). Running balance is maintained
 * per-resident account so each row reflects that resident's balance at that
 * point in time.
 */
export function listAllResidentLedgerLines(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
): AllResidentLedgerLine[] {
  requireBillingAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);

  const rows = db
    .select({
      txn: billingTransactions,
      residentId: residents.id,
      residentFullName: residents.fullName,
      residentStatus: residents.status,
      accountId: accounts.id,
    })
    .from(billingTransactions)
    .innerJoin(accounts, eq(accounts.id, billingTransactions.accountId))
    .innerJoin(residents, eq(residents.id, accounts.residentId))
    .where(
      and(
        eq(accounts.accountType, "resident"),
        eq(residents.homeId, homeId),
      ),
    )
    .orderBy(asc(billingTransactions.postedAtUtcMs), asc(billingTransactions.id))
    .all();

  const runningBalances = new Map<string, number>();
  return rows.map((r) => {
    const prev = runningBalances.get(r.accountId) ?? 0;
    const next = prev + r.txn.amountMinor;
    runningBalances.set(r.accountId, next);
    return {
      residentId: r.residentId,
      residentFullName: r.residentFullName,
      residentStatus: r.residentStatus as "active" | "departed",
      accountId: r.accountId,
      transaction: r.txn,
      runningBalanceMinor: next,
    };
  });
}

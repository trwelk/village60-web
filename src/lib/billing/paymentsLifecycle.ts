import { and, asc, eq } from "drizzle-orm";
import { assertActorMayAccessHome } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import {
  billingTransactions,
  accounts,
  residents,
  type billingTransactions as billingTransactionsTable,
} from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { ForbiddenError, NotFoundError } from "@/lib/homes/errors";

type BillingTransactionRow = typeof billingTransactionsTable.$inferSelect;

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

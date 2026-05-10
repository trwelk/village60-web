import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { assertActorMayAccessHome } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import {
  billingPayments,
  billingTransactions,
  accounts,
  homes,
  invoices,
  users,
} from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/homes/errors";
import { utcCalendarDateIsoFromUtcMs } from "@/lib/billing/receivedOnUtcMs";

function requireBillingAdmin(
  actor: SessionActor | undefined,
): asserts actor is SessionActor {
  if (!actor || actor.role !== "admin") {
    throw new ForbiddenError();
  }
}

/**
 * Return the home billing account, creating it on first access if it does not
 * yet exist. Caller is responsible for home-scope authorization.
 */
export function ensureHomeAccount(
  db: AppDb,
  homeId: string,
): typeof accounts.$inferSelect {
  const existing = db
    .select()
    .from(accounts)
    .where(and(eq(accounts.accountType, "home"), eq(accounts.homeId, homeId)))
    .get();
  if (existing) {
    return existing;
  }

  const home = db
    .select({ id: homes.id, defaultCurrencyCode: homes.defaultCurrencyCode })
    .from(homes)
    .where(eq(homes.id, homeId))
    .get();
  if (!home) {
    throw new NotFoundError("Home not found.");
  }

  const now = Date.now();
  const id = randomUUID();
  db.insert(accounts)
    .values({
      id,
      accountType: "home",
      residentId: null,
      homeId,
      currencyCode: home.defaultCurrencyCode,
      createdAtUtcMs: now,
      updatedAtUtcMs: now,
    })
    .run();

  return {
    id,
    accountType: "home",
    residentId: null,
    homeId,
    currencyCode: home.defaultCurrencyCode,
    createdAtUtcMs: now,
    updatedAtUtcMs: now,
  };
}

export type PostHomeTransactionInput = {
  homeId: string;
  txnType: string;
  amountMinor: number;
  sourceKind: string;
  sourceId?: string | null;
  memo?: string | null;
  postedAtUtcMs?: number;
};

export type PostHomeTransactionResult = {
  ledgerTransactionId: string;
  accountId: string;
};

/**
 * Post a signed ledger entry against the home billing account.
 * Use positive `amountMinor` for expenses (debit); negative for credits/refunds.
 */
export function postHomeTransaction(
  db: AppDb,
  actor: SessionActor | undefined,
  input: PostHomeTransactionInput,
): PostHomeTransactionResult {
  requireBillingAdmin(actor);
  assertActorMayAccessHome(db, actor, input.homeId);

  if (!Number.isInteger(input.amountMinor)) {
    throw new ValidationError("amountMinor must be an integer.");
  }
  if (!input.sourceKind.trim()) {
    throw new ValidationError("sourceKind is required.");
  }

  return db.transaction((tx) => {
    const account = ensureHomeAccount(tx, input.homeId);
    const ledgerTransactionId = randomUUID();

    tx.insert(billingTransactions)
      .values({
        id: ledgerTransactionId,
        accountId: account.id,
        accountType: "home",
        txnType: input.txnType,
        amountMinor: input.amountMinor,
        sourceKind: input.sourceKind,
        sourceId: input.sourceId ?? null,
        memo: input.memo?.trim() || null,
        recordedByUserId: actor.userId,
        postedAtUtcMs: input.postedAtUtcMs ?? Date.now(),
      })
      .run();

    return { ledgerTransactionId, accountId: account.id };
  });
}

export type HomeAccountLedgerLine = {
  id: string;
  accountType: "home";
  txnType: string;
  amountMinor: number;
  sourceKind: string;
  sourceId: string | null;
  memo: string | null;
  recordedByUserId: string | null;
  postedAtUtcMs: number;
  runningBalanceMinor: number;
};

/**
 * Running-balance statement for a home billing account.
 */
export function getHomeAccountStatement(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
): {
  accountId: string;
  currentBalanceMinor: number;
  lines: HomeAccountLedgerLine[];
} {
  requireBillingAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);

  const account = db
    .select()
    .from(accounts)
    .where(and(eq(accounts.accountType, "home"), eq(accounts.homeId, homeId)))
    .get();
  if (!account) {
    return { accountId: "", currentBalanceMinor: 0, lines: [] };
  }

  const rows = db
    .select()
    .from(billingTransactions)
    .where(eq(billingTransactions.accountId, account.id))
    .all()
    .sort((a, b) => a.postedAtUtcMs - b.postedAtUtcMs || a.id.localeCompare(b.id));

  let runningBalanceMinor = 0;
  const lines: HomeAccountLedgerLine[] = rows.map((row) => {
    runningBalanceMinor += row.amountMinor;
    return {
      id: row.id,
      accountType: "home",
      txnType: row.txnType,
      amountMinor: row.amountMinor,
      sourceKind: row.sourceKind,
      sourceId: row.sourceId ?? null,
      memo: row.memo ?? null,
      recordedByUserId: row.recordedByUserId ?? null,
      postedAtUtcMs: row.postedAtUtcMs,
      runningBalanceMinor,
    };
  });

  return { accountId: account.id, currentBalanceMinor: runningBalanceMinor, lines };
}

export type HomeAccountPaymentLedgerRow = {
  paymentId: string;
  chargeId: string;
  billingMonth: string;
  amountMinorSnapshot?: number;
  amountMinor: number;
  paidOn: string;
  method: string;
  externalReference: string | null;
  notes: string | null;
  recordedByUserId: string | null;
  recordedByEmail: string | null;
};

/**
 * Paginated list of payment receipts posted to a home operating account
 * (admin + home scope), newest first. Mirrors resident monthly payment ledger
 * shape minus resident columns.
 */
export function listHomeAccountPaymentsLedger(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  input: { page: number; pageSize: number },
): {
  rows: HomeAccountPaymentLedgerRow[];
  totalCount: number;
  page: number;
  pageSize: number;
} {
  requireBillingAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);
  const home = db.select({ id: homes.id }).from(homes).where(eq(homes.id, homeId)).get();
  if (!home) throw new NotFoundError();

  const rows = db
    .select({ p: billingPayments, txn: billingTransactions, user: users })
    .from(billingPayments)
    .innerJoin(billingTransactions, eq(billingTransactions.id, billingPayments.ledgerTransactionId))
    .innerJoin(accounts, eq(accounts.id, billingPayments.accountId))
    .leftJoin(users, eq(users.id, billingPayments.recordedByUserId))
    .where(and(eq(accounts.accountType, "home"), eq(accounts.homeId, homeId)))
    .orderBy(desc(billingPayments.receivedOn))
    .all()
    .filter((r) => !r.txn.memo?.startsWith("other-charge:"))
    .map((r) => {
      const chargeId = r.txn.memo?.startsWith("charge:")
        ? r.txn.memo.slice("charge:".length)
        : null;
      const charge = chargeId
        ? db.select().from(billingTransactions).where(eq(billingTransactions.id, chargeId)).get()
        : null;
      const invoice = charge?.sourceId
        ? db.select().from(invoices).where(eq(invoices.id, charge.sourceId)).get()
        : null;
      return {
        paymentId: r.p.id,
        chargeId: chargeId ?? r.txn.id,
        billingMonth:
          invoice?.issuedOn?.slice(0, 7) ??
          utcCalendarDateIsoFromUtcMs(r.p.receivedOn).slice(0, 7),
        amountMinorSnapshot: charge?.amountMinor,
        amountMinor: r.p.amountMinor,
        paidOn: utcCalendarDateIsoFromUtcMs(r.p.receivedOn),
        method: r.p.method,
        externalReference: r.p.externalReference ?? null,
        notes: r.p.notes,
        recordedByUserId: r.p.recordedByUserId,
        recordedByEmail: r.user?.email ?? null,
      } satisfies HomeAccountPaymentLedgerRow;
    });

  const totalCount = rows.length;
  const offset = (input.page - 1) * input.pageSize;
  return {
    rows: rows.slice(offset, offset + input.pageSize),
    totalCount,
    page: input.page,
    pageSize: input.pageSize,
  };
}
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { assertActorMayAccessHome } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import { billingTransactions, homeAccounts, homes } from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/homes/errors";

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
): typeof homeAccounts.$inferSelect {
  const existing = db
    .select()
    .from(homeAccounts)
    .where(eq(homeAccounts.homeId, homeId))
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
  db.insert(homeAccounts)
    .values({
      id,
      homeId,
      currencyCode: home.defaultCurrencyCode,
      createdAtUtcMs: now,
      updatedAtUtcMs: now,
    })
    .run();

  return { id, homeId, currencyCode: home.defaultCurrencyCode, createdAtUtcMs: now, updatedAtUtcMs: now };
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
  reversesTransactionId: string | null;
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
    .from(homeAccounts)
    .where(eq(homeAccounts.homeId, homeId))
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
      reversesTransactionId: row.reversesTransactionId ?? null,
      runningBalanceMinor,
    };
  });

  return { accountId: account.id, currentBalanceMinor: runningBalanceMinor, lines };
}

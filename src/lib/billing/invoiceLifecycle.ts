import { randomUUID } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { assertActorMayAccessHome } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import {
  billingTransactions,
  invoiceLineItems,
  invoices,
  accounts,
  residents,
  wards,
} from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/homes/errors";
import { parseBillingMonth, utcDateOnlyFromMs } from "@/lib/billing/billingMonth";
import { bumpInvNumberSequence } from "@/lib/billing/invoiceNumbers";
import { settleFinalizedInvoicesFifo } from "@/lib/billing/invoiceSettlement";

function requireBillingAdmin(
  actor: SessionActor | undefined,
): asserts actor is SessionActor {
  if (!actor || actor.role !== "admin") {
    throw new ForbiddenError();
  }
}

/** Keep draft invoice date when valid; otherwise derive from finalization time (UTC date). */
function issuedOnForFinalizedInvoice(
  invoice: typeof invoices.$inferSelect,
  finalizedAtUtcMs: number,
): string {
  const trimmed = invoice.issuedOn?.trim();
  if (trimmed && /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  return utcDateOnlyFromMs(finalizedAtUtcMs);
}

function normalizeServiceMonth(raw: string | null | undefined): string | null {
  if (raw == null) {
    return null;
  }
  const month = raw.trim();
  if (month === "") {
    return null;
  }
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new ValidationError("serviceMonth must be YYYY-MM.");
  }
  return month;
}

function normalizeIssuedOn(raw: string | null | undefined): string | null {
  if (raw == null) {
    return null;
  }
  const issuedOn = raw.trim();
  if (issuedOn === "") {
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issuedOn)) {
    throw new ValidationError("issuedOn must be YYYY-MM-DD.");
  }
  return issuedOn;
}

function linePostingSource(
  accountId: string,
  line: typeof invoiceLineItems.$inferSelect,
): { sourceKind: string; sourceId: string } {
  if (line.category === "monthly_fee") {
    const serviceMonth = normalizeServiceMonth(line.serviceMonth);
    if (!serviceMonth) {
      throw new ValidationError("monthly_fee line requires serviceMonth.");
    }
    return {
      sourceKind: "invoice_monthly_fee",
      sourceId: `${accountId}:${serviceMonth}`,
    };
  }
  return { sourceKind: "invoice_line_item", sourceId: line.id };
}

export type DraftInvoiceLineInput = {
  id?: string;
  category: string;
  description: string;
  amountMinor: number;
  serviceMonth?: string | null;
};

export type InvoiceListItem = {
  id: string;
  accountId: string;
  homeId: string | null;
  invNo: string | null;
  purchaseOrderId: string | null;
  status: string;
  issuedOn: string | null;
  totalMinorSnapshot: number | null;
  createdAtUtcMs: number;
  updatedAtUtcMs: number;
  accountType: "resident" | "home";
};

export type InvoiceDetails = InvoiceListItem & {
  monthlyFeeAmountMinor: number | null;
  lineItems: {
    id: string;
    category: string;
    description: string;
    amountMinor: number;
    serviceMonth: string | null;
    quantity: number;
  }[];
};

function getWardRateForAccount(
  db: AppDb,
  accountId: string,
): { monthlyRatePerPersonMinor: number } {
  const row = db
    .select({
      wardId: residents.wardId,
      monthlyRatePerPersonMinor: wards.monthlyRatePerPersonMinor,
    })
    .from(accounts)
    .innerJoin(residents, eq(residents.id, accounts.residentId))
    .leftJoin(wards, eq(wards.id, residents.wardId))
    .where(and(eq(accounts.id, accountId), eq(accounts.accountType, "resident")))
    .get();
  if (!row || row.wardId == null || row.monthlyRatePerPersonMinor == null) {
    throw new ValidationError(
      "monthly_fee amount is fetched from the resident ward. Configure ward and monthly rate first.",
    );
  }
  return { monthlyRatePerPersonMinor: row.monthlyRatePerPersonMinor };
}

function deriveDraftLineValues(
  db: AppDb,
  accountId: string,
  line: DraftInvoiceLineInput,
): {
  category: string;
  description: string;
  amountMinor: number;
  serviceMonth: string | null;
} {
  const category = line.category.trim();
  const description = line.description.trim();
  if (category === "monthly_fee") {
    const wardRate = getWardRateForAccount(db, accountId);
    return {
      category,
      description,
      amountMinor: wardRate.monthlyRatePerPersonMinor,
      serviceMonth: normalizeServiceMonth(line.serviceMonth),
    };
  }
  return {
    category,
    description,
    amountMinor: line.amountMinor,
    serviceMonth: normalizeServiceMonth(line.serviceMonth),
  };
}

function invoiceHomeScopePredicate(homeId: string) {
  return or(
    and(eq(accounts.accountType, "resident"), eq(residents.homeId, homeId)),
    and(eq(accounts.accountType, "home"), eq(accounts.homeId, homeId)),
  );
}

function getInvoiceForHome(db: AppDb, homeId: string, invoiceId: string) {
  const row = db
    .select({ invoice: invoices })
    .from(invoices)
    .innerJoin(accounts, eq(accounts.id, invoices.accountId))
    .leftJoin(residents, eq(residents.id, accounts.residentId))
    .where(and(eq(invoices.id, invoiceId), invoiceHomeScopePredicate(homeId)))
    .get();
  if (!row) {
    throw new NotFoundError();
  }
  return row.invoice;
}

function getInvoiceForHomeTx(tx: AppDb, homeId: string, invoiceId: string) {
  const row = tx
    .select({ invoice: invoices })
    .from(invoices)
    .innerJoin(accounts, eq(accounts.id, invoices.accountId))
    .leftJoin(residents, eq(residents.id, accounts.residentId))
    .where(and(eq(invoices.id, invoiceId), invoiceHomeScopePredicate(homeId)))
    .get();
  if (!row) {
    throw new NotFoundError();
  }
  return row.invoice;
}

function getInvoiceById(db: AppDb, invoiceId: string) {
  const invoice = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
  if (!invoice) {
    throw new NotFoundError();
  }
  return invoice;
}

function getInvoiceByIdTx(tx: AppDb, invoiceId: string) {
  const invoice = tx.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
  if (!invoice) {
    throw new NotFoundError();
  }
  return invoice;
}

function isSqliteUniqueConstraintError(e: unknown): boolean {
  if (!e || typeof e !== "object") {
    return false;
  }
  const err = e as { code?: string; message?: string };
  if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
    return true;
  }
  if (typeof err.message === "string" && err.message.includes("UNIQUE constraint failed")) {
    return true;
  }
  return false;
}

function finalizeInvoiceTransaction(
  tx: AppDb,
  invoice: typeof invoices.$inferSelect,
  lines: (typeof invoiceLineItems.$inferSelect)[],
  input: { finalizedAtUtcMs: number; recordedByUserId: string | null },
): {
  invoiceId: string;
  totalMinorSnapshot: number;
  postedTransactionIds: string[];
} {
  if (invoice.status === "finalized") {
    const expectedSources = lines.map((line) => linePostingSource(invoice.accountId, line));
    const expectedLineIds = expectedSources
      .filter((s) => s.sourceKind === "invoice_line_item")
      .map((s) => s.sourceId);
    const expectedMonthlyFeeKeys = expectedSources
      .filter((s) => s.sourceKind === "invoice_monthly_fee")
      .map((s) => s.sourceId);
    const existingLineItemTxns =
      expectedLineIds.length === 0
        ? []
        : tx
            .select()
            .from(billingTransactions)
            .where(
              and(
                eq(billingTransactions.sourceKind, "invoice_line_item"),
                inArray(billingTransactions.sourceId, expectedLineIds),
              ),
            )
            .all();
    const existingMonthlyFeeTxns =
      expectedMonthlyFeeKeys.length === 0
        ? []
        : tx
            .select()
            .from(billingTransactions)
            .where(
              and(
                eq(billingTransactions.sourceKind, "invoice_monthly_fee"),
                inArray(billingTransactions.sourceId, expectedMonthlyFeeKeys),
              ),
            )
            .all();
    const existing = [...existingLineItemTxns, ...existingMonthlyFeeTxns];
    return {
      invoiceId: invoice.id,
      totalMinorSnapshot: invoice.totalMinorSnapshot ?? 0,
      postedTransactionIds: existing.map((row) => row.id),
    };
  }

  if (invoice.status !== "draft") {
    throw new ValidationError("Only draft invoices can be finalized.");
  }

  const accountRow = tx
    .select({ accountType: accounts.accountType })
    .from(accounts)
    .where(eq(accounts.id, invoice.accountId))
    .get();
  if (!accountRow) {
    throw new NotFoundError("Billing account not found.");
  }

  const totalMinorSnapshot = lines.reduce((sum, line) => sum + line.amountMinor, 0);
  const postedTransactionIds: string[] = [];
  for (const line of lines) {
    const source = linePostingSource(invoice.accountId, line);
    const id = randomUUID();
    postedTransactionIds.push(id);
    tx.insert(billingTransactions)
      .values({
        id,
        accountId: invoice.accountId,
        accountType: accountRow.accountType,
        txnType: "charge",
        amountMinor: line.amountMinor,
        sourceKind: source.sourceKind,
        sourceId: source.sourceId,
        memo: line.description,
        recordedByUserId: input.recordedByUserId,
        postedAtUtcMs: input.finalizedAtUtcMs,
      })
      .run();
  }

  tx.update(invoices)
    .set({
      status: "finalized",
      issuedOn: issuedOnForFinalizedInvoice(invoice, input.finalizedAtUtcMs),
      totalMinorSnapshot,
      updatedAtUtcMs: input.finalizedAtUtcMs,
    })
    .where(eq(invoices.id, invoice.id))
    .run();

  settleFinalizedInvoicesFifo(tx, {
    accountId: invoice.accountId,
    nowUtcMs: input.finalizedAtUtcMs,
  });

  return {
    invoiceId: invoice.id,
    totalMinorSnapshot,
    postedTransactionIds,
  };
}

/**
 * Finalize within an existing transaction (e.g. create draft lines then post in one atomic step).
 */
export function finalizeInvoiceInTransaction(
  tx: AppDb,
  invoiceId: string,
  input: { finalizedAtUtcMs: number; recordedByUserId: string | null },
): {
  invoiceId: string;
  totalMinorSnapshot: number;
  postedTransactionIds: string[];
} {
  const invoice = getInvoiceByIdTx(tx, invoiceId);
  const lines = tx
    .select()
    .from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invoice.id))
    .all();
  return finalizeInvoiceTransaction(tx, invoice, lines, input);
}

export function listHomeInvoices(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
): InvoiceListItem[] {
  requireBillingAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);

  const rows = db
    .select({ invoice: invoices, accountType: accounts.accountType })
    .from(invoices)
    .innerJoin(accounts, eq(accounts.id, invoices.accountId))
    .leftJoin(residents, eq(residents.id, accounts.residentId))
    .where(invoiceHomeScopePredicate(homeId))
    .all();
  return rows
    .map((row) => ({
      ...row.invoice,
      accountType: row.accountType,
    }))
    .sort((a, b) => b.createdAtUtcMs - a.createdAtUtcMs || a.id.localeCompare(b.id));
}

export function getInvoiceDetails(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  invoiceId: string,
): InvoiceDetails {
  requireBillingAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);
  const invoice = getInvoiceForHome(db, homeId, invoiceId);
  const ownerRow = db
    .select({ accountType: accounts.accountType })
    .from(accounts)
    .where(eq(accounts.id, invoice.accountId))
    .get();
  const lineItems = db
    .select()
    .from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invoiceId))
    .all()
    .map((line) => ({
      id: line.id,
      category: line.category,
      description: line.description,
      amountMinor: line.amountMinor,
      serviceMonth: line.serviceMonth,
      quantity: line.quantity,
    }));
  const monthlyFeeRate = db
    .select({ monthlyRatePerPersonMinor: wards.monthlyRatePerPersonMinor })
    .from(invoices)
    .innerJoin(accounts, eq(accounts.id, invoices.accountId))
    .leftJoin(residents, eq(residents.id, accounts.residentId))
    .leftJoin(wards, eq(wards.id, residents.wardId))
    .where(and(eq(invoices.id, invoiceId), eq(accounts.accountType, "resident")))
    .get();
  return {
    ...invoice,
    accountType: (ownerRow?.accountType ?? "resident") as "resident" | "home",
    monthlyFeeAmountMinor: monthlyFeeRate?.monthlyRatePerPersonMinor ?? null,
    lineItems,
  };
}

export function createDraftInvoice(
  db: AppDb,
  actor: SessionActor | undefined,
  input: {
    homeId?: string;
    accountId: string;
    lineItems: DraftInvoiceLineInput[];
    nowUtcMs?: number;
  },
): { invoiceId: string } {
  requireBillingAdmin(actor);
  if (input.homeId) {
    assertActorMayAccessHome(db, actor, input.homeId);
  }
  const residentAccount = db
    .select({ id: accounts.id, residentHomeId: residents.homeId })
    .from(accounts)
    .innerJoin(residents, eq(residents.id, accounts.residentId))
    .where(and(eq(accounts.id, input.accountId), eq(accounts.accountType, "resident")))
    .get();

  const homeAccount =
    residentAccount == null
      ? db
          .select({ id: accounts.id, billingHomeId: accounts.homeId })
          .from(accounts)
          .where(and(eq(accounts.id, input.accountId), eq(accounts.accountType, "home")))
          .get()
      : null;

  let billingHomeId: string;
  if (residentAccount) {
    if (input.homeId && residentAccount.residentHomeId !== input.homeId) {
      throw new NotFoundError();
    }
    billingHomeId = residentAccount.residentHomeId;
  } else if (homeAccount?.billingHomeId) {
    if (input.homeId && homeAccount.billingHomeId !== input.homeId) {
      throw new NotFoundError();
    }
    billingHomeId = homeAccount.billingHomeId;
  } else {
    throw new NotFoundError();
  }
  const now = input.nowUtcMs ?? Date.now();
  const issuedOn = utcDateOnlyFromMs(now);
  const invoiceId = randomUUID();
  db.transaction((tx) => {
    const invNo = bumpInvNumberSequence(tx, billingHomeId, now);
    tx.insert(invoices)
      .values({
        id: invoiceId,
        accountId: input.accountId,
        homeId: billingHomeId,
        invNo,
        purchaseOrderId: null,
        status: "draft",
        issuedOn,
        totalMinorSnapshot: null,
        createdAtUtcMs: now,
        updatedAtUtcMs: now,
      })
      .run();
    for (const line of input.lineItems) {
      const values = deriveDraftLineValues(tx, input.accountId, line);
      tx.insert(invoiceLineItems)
        .values({
          id: line.id ?? randomUUID(),
          invoiceId,
          category: values.category,
          description: values.description,
          amountMinor: values.amountMinor,
          serviceMonth: values.serviceMonth,
          quantity: 1,
          createdAtUtcMs: now,
          updatedAtUtcMs: now,
        })
        .run();
    }
  });
  return { invoiceId };
}

export function updateDraftInvoice(
  db: AppDb,
  actor: SessionActor | undefined,
  input: {
    homeId?: string;
    invoiceId: string;
    issuedOn?: string | null;
    lineItems: DraftInvoiceLineInput[];
    nowUtcMs?: number;
  },
): void {
  requireBillingAdmin(actor);
  if (input.homeId) {
    assertActorMayAccessHome(db, actor, input.homeId);
  }
  const now = input.nowUtcMs ?? Date.now();
  db.transaction((tx) => {
    const invoice = input.homeId
      ? getInvoiceForHome(db, input.homeId, input.invoiceId)
      : getInvoiceById(db, input.invoiceId);
    if (invoice.status !== "draft") {
      throw new ValidationError("Only draft invoices can be edited.");
    }

    tx.update(invoices)
      .set({
        issuedOn:
          input.issuedOn === undefined ? invoice.issuedOn : normalizeIssuedOn(input.issuedOn),
        updatedAtUtcMs: now,
      })
      .where(eq(invoices.id, invoice.id))
      .run();

    const existing = tx
      .select()
      .from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, invoice.id))
      .all();
    const existingById = new Map(existing.map((line) => [line.id, line]));

    const keepIds = new Set<string>();
    for (const line of input.lineItems) {
      const lineId = line.id?.trim() || randomUUID();
      keepIds.add(lineId);
      const draftValues = deriveDraftLineValues(tx, invoice.accountId, line);
      const values = {
        category: draftValues.category,
        description: draftValues.description,
        amountMinor: draftValues.amountMinor,
        serviceMonth: draftValues.serviceMonth,
        quantity: 1,
        updatedAtUtcMs: now,
      };
      if (existingById.has(lineId)) {
        tx.update(invoiceLineItems)
          .set(values)
          .where(eq(invoiceLineItems.id, lineId))
          .run();
      } else {
        tx.insert(invoiceLineItems)
          .values({
            id: lineId,
            invoiceId: invoice.id,
            ...values,
            createdAtUtcMs: now,
          })
          .run();
      }
    }

    const deleteIds = existing.map((line) => line.id).filter((id) => !keepIds.has(id));
    if (deleteIds.length > 0) {
      tx.delete(invoiceLineItems)
        .where(inArray(invoiceLineItems.id, deleteIds))
        .run();
    }
  });
}

export function finalizeInvoice(
  db: AppDb,
  actor: SessionActor | undefined,
  input: { homeId?: string; invoiceId: string; finalizedAtUtcMs: number },
): {
  invoiceId: string;
  totalMinorSnapshot: number;
  postedTransactionIds: string[];
} {
  requireBillingAdmin(actor);
  if (input.homeId) {
    assertActorMayAccessHome(db, actor, input.homeId);
  }

  return db.transaction((tx) => {
    const invoice = input.homeId
      ? getInvoiceForHomeTx(tx, input.homeId, input.invoiceId)
      : getInvoiceByIdTx(tx, input.invoiceId);
    return finalizeInvoiceInTransaction(tx, invoice.id, {
      finalizedAtUtcMs: input.finalizedAtUtcMs,
      recordedByUserId: actor.userId,
    });
  });
}

/**
 * Trusted internal finalization (e.g. cron) with no session actor.
 * Caller must enforce authentication / scheduling guarantees.
 */
export function finalizeInvoiceAsTrustedSystem(
  db: AppDb,
  input: { invoiceId: string; finalizedAtUtcMs: number },
): {
  invoiceId: string;
  totalMinorSnapshot: number;
  postedTransactionIds: string[];
} {
  return db.transaction((tx) =>
    finalizeInvoiceInTransaction(tx, input.invoiceId, {
      finalizedAtUtcMs: input.finalizedAtUtcMs,
      recordedByUserId: null,
    }),
  );
}

export type FinalizeDraftInvoicesForBillingMonthResult = {
  billingMonth: string;
  finalizedInvoiceIds: string[];
  conflictInvoiceIds: string[];
};

/**
 * Finalizes every draft invoice for a billing month. Continues when a row hits
 * the monthly-fee unique ledger constraint (invoice stays draft).
 */
export function finalizeDraftInvoicesForBillingMonth(
  db: AppDb,
  input: { billingMonth: string; finalizedAtUtcMs: number },
): FinalizeDraftInvoicesForBillingMonthResult {
  const billingMonth = parseBillingMonth(input.billingMonth);
  const drafts = db
    .select({ id: invoices.id })
    .from(invoices)
    .innerJoin(
      invoiceLineItems,
      and(
        eq(invoiceLineItems.invoiceId, invoices.id),
        eq(invoiceLineItems.category, "monthly_fee"),
        eq(invoiceLineItems.serviceMonth, billingMonth),
      ),
    )
    .where(eq(invoices.status, "draft"))
    .groupBy(invoices.id)
    .all();
  const finalizedInvoiceIds: string[] = [];
  const conflictInvoiceIds: string[] = [];
  for (const row of drafts) {
    try {
      finalizeInvoiceAsTrustedSystem(db, {
        invoiceId: row.id,
        finalizedAtUtcMs: input.finalizedAtUtcMs,
      });
      finalizedInvoiceIds.push(row.id);
    } catch (e) {
      if (isSqliteUniqueConstraintError(e)) {
        conflictInvoiceIds.push(row.id);
        continue;
      }
      throw e;
    }
  }
  return { billingMonth, finalizedInvoiceIds, conflictInvoiceIds };
}

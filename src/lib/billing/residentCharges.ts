import { and, desc, eq, sql } from "drizzle-orm";
import { assertActorMayAccessHome } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import {
  billingPayments,
  billingTransactions,
  homes,
  invoices,
  invoiceLineItems,
  residentAccounts,
  residents,
  users,
} from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { ForbiddenError, NotFoundError } from "@/lib/homes/errors";

export type HomeMonthlyChargeLedgerRow = {
  id: string;
  chargeId: string;
  billingMonth: string;
  wardIdSnapshot?: string;
  wardLabel?: string | null;
  wardLabelSnapshot: string | null;
  amountMinorSnapshot: number;
  paid: boolean;
  paidOn: string | null;
  payment?: null | {
    id: string;
    amountMinor: number;
    paidOn: string;
    notes: string | null;
    recordedByUserId: string;
    createdAtUtcMs: number;
    updatedAtUtcMs: number;
  };
  residentId: string;
  residentFullName: string;
  residentStatus?: string;
};

export type HomeMonthlyChargesLedgerPaymentStatusFilter = "all" | "paid" | "unpaid";
export type HomeMonthlyChargesLedgerSummary = {
  totalBilledMinor: number;
  chargeCount: number;
  paidCount: number;
  unpaidCount: number;
  unpaidBalanceMinor: number;
};

export const DEFAULT_CHARGES_LEDGER_PAGE_SIZE = 25;
export const MAX_CHARGES_LEDGER_PAGE_SIZE = 100;

export type HomeOtherChargeLedgerRow = {
  id: string;
  chargeId: string;
  residentId: string;
  residentFullName: string;
  residentStatus?: string;
  type: string;
  amountMinor: number;
  received: boolean;
  paidOn: string | null;
};
export type HomeOtherChargesReceivedFilter = "all" | "unpaid" | "paid";
export type HomeOtherChargesLedgerSummary = {
  totalRows?: number;
  totalAmountMinor: number;
  outstandingAmountMinor: number;
  receivedLineCount: number;
};

export type UnpaidMonthlyChargeWorklistRow = {
  id: string;
  chargeId: string;
  billingMonth: string;
  amountMinorSnapshot: number;
  wardLabel?: string | null;
};
export type HomeUnpaidMonthlyChargesWorklistEntry = {
  residentId: string;
  residentFullName: string;
  residentStatus?: string;
  oldestUnpaidBillingMonth?: string;
  totalUnpaidMinor?: number;
  unpaid: UnpaidMonthlyChargeWorklistRow[];
  unpaidCharges?: UnpaidMonthlyChargeWorklistRow[];
};

export const DEFAULT_PAYMENTS_LEDGER_PAGE_SIZE = DEFAULT_CHARGES_LEDGER_PAGE_SIZE;
export const MAX_PAYMENTS_LEDGER_PAGE_SIZE = MAX_CHARGES_LEDGER_PAGE_SIZE;
export type HomeMonthlyPaymentLedgerRow = {
  paymentId: string;
  chargeId: string;
  billingMonth: string;
  amountMinorSnapshot?: number;
  residentId: string;
  residentFullName: string;
  residentStatus?: string;
  amountMinor: number;
  paidOn: string;
  notes: string | null;
  recordedByUserId: string | null;
  recordedByEmail: string | null;
};

type ChargeCore = {
  chargeId: string;
  accountId: string;
  residentId: string;
  residentFullName: string;
  residentStatus: string;
  billingMonth: string;
  amountMinorSnapshot: number;
  wardIdSnapshot: string | null;
};

function requireBillingAdmin(actor: SessionActor | undefined): asserts actor is SessionActor {
  if (!actor || actor.role !== "admin") {
    throw new ForbiddenError();
  }
}

function linkedPaymentByChargeId(db: AppDb, chargeId: string) {
  return db
    .select({ payment: billingPayments, txn: billingTransactions })
    .from(billingPayments)
    .innerJoin(billingTransactions, eq(billingTransactions.id, billingPayments.ledgerTransactionId))
    .where(eq(billingTransactions.memo, `charge:${chargeId}`))
    .get();
}

function chargeRowsForHome(db: AppDb, homeId: string, from?: string, to?: string): ChargeCore[] {
  const lineItemRows = db
    .select({
      charge: billingTransactions,
      invoice: invoices,
      resident: residents,
      line: invoiceLineItems,
    })
    .from(billingTransactions)
    .innerJoin(residentAccounts, eq(residentAccounts.id, billingTransactions.accountId))
    .innerJoin(residents, eq(residents.id, residentAccounts.residentId))
    .innerJoin(
      invoiceLineItems,
      and(
        eq(billingTransactions.sourceKind, "invoice_line_item"),
        eq(billingTransactions.sourceId, invoiceLineItems.id),
      ),
    )
    .innerJoin(invoices, eq(invoiceLineItems.invoiceId, invoices.id))
    .where(and(eq(residents.homeId, homeId), eq(billingTransactions.txnType, "charge")))
    .all();

  const monthlyFeeRows = db
    .select({
      charge: billingTransactions,
      invoice: invoices,
      resident: residents,
      line: invoiceLineItems,
    })
    .from(billingTransactions)
    .innerJoin(residentAccounts, eq(residentAccounts.id, billingTransactions.accountId))
    .innerJoin(residents, eq(residents.id, residentAccounts.residentId))
    .innerJoin(
      invoiceLineItems,
      and(
        eq(billingTransactions.sourceKind, "invoice_monthly_fee"),
        eq(invoiceLineItems.category, "monthly_fee"),
        sql`(${billingTransactions.accountId} || ':' || ${invoiceLineItems.serviceMonth}) = ${billingTransactions.sourceId}`,
      ),
    )
    .innerJoin(invoices, eq(invoiceLineItems.invoiceId, invoices.id))
    .where(and(eq(residents.homeId, homeId), eq(billingTransactions.txnType, "charge")))
    .all();

  const legacyInvoiceRows = db
    .select({
      charge: billingTransactions,
      invoice: invoices,
      resident: residents,
      line: invoiceLineItems,
    })
    .from(billingTransactions)
    .innerJoin(residentAccounts, eq(residentAccounts.id, billingTransactions.accountId))
    .innerJoin(residents, eq(residents.id, residentAccounts.residentId))
    .innerJoin(
      invoices,
      and(eq(billingTransactions.sourceKind, "invoice"), eq(billingTransactions.sourceId, invoices.id)),
    )
    .leftJoin(
      invoiceLineItems,
      and(eq(invoiceLineItems.invoiceId, invoices.id), eq(invoiceLineItems.serviceMonth, invoices.billingPeriod)),
    )
    .where(and(eq(residents.homeId, homeId), eq(billingTransactions.txnType, "charge")))
    .all();

  const merged = [...lineItemRows, ...monthlyFeeRows, ...legacyInvoiceRows];
  const byChargeId = new Map<string, (typeof merged)[0]>();
  for (const r of merged) {
    byChargeId.set(r.charge.id, r);
  }

  return [...byChargeId.values()]
    .filter((r) => r.invoice.billingPeriod !== null)
    .map((r) => ({
      chargeId: r.charge.id,
      accountId: r.charge.accountId,
      residentId: r.resident.id,
      residentFullName: r.resident.fullName,
      residentStatus: r.resident.status,
      billingMonth: r.invoice.billingPeriod!,
      amountMinorSnapshot: r.charge.amountMinor,
      wardIdSnapshot: r.line?.wardIdSnapshot ?? null,
    }))
    .filter((r) => (from ? r.billingMonth >= from : true))
    .filter((r) => (to ? r.billingMonth <= to : true));
}

function mapChargeWithPayment(db: AppDb, c: ChargeCore): HomeMonthlyChargeLedgerRow {
  const linked = linkedPaymentByChargeId(db, c.chargeId);
  return {
    id: c.chargeId,
    chargeId: c.chargeId,
    residentId: c.residentId,
    residentFullName: c.residentFullName,
    residentStatus: c.residentStatus,
    billingMonth: c.billingMonth,
    wardIdSnapshot: c.wardIdSnapshot ?? undefined,
    wardLabel: null,
    wardLabelSnapshot: null,
    amountMinorSnapshot: c.amountMinorSnapshot,
    paid: Boolean(linked),
    paidOn: linked?.payment.receivedOn ?? null,
    payment: linked
      ? {
          id: linked.payment.id,
          amountMinor: linked.payment.amountMinor,
          paidOn: linked.payment.receivedOn,
          notes: linked.payment.notes,
          recordedByUserId: linked.payment.recordedByUserId ?? "",
          createdAtUtcMs: linked.payment.createdAtUtcMs,
          updatedAtUtcMs: linked.payment.updatedAtUtcMs,
        }
      : null,
  };
}

export function listHomeMonthlyChargesLedger(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  input: {
    paymentStatus: HomeMonthlyChargesLedgerPaymentStatusFilter;
    billingMonthFrom?: string;
    billingMonthTo?: string;
    page: number;
    pageSize: number;
  },
): {
  rows: HomeMonthlyChargeLedgerRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  summary: HomeMonthlyChargesLedgerSummary;
} {
  requireBillingAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);
  const home = db.select({ id: homes.id }).from(homes).where(eq(homes.id, homeId)).get();
  if (!home) throw new NotFoundError();

  let rows = chargeRowsForHome(db, homeId, input.billingMonthFrom, input.billingMonthTo).map((c) =>
    mapChargeWithPayment(db, c),
  );
  if (input.paymentStatus === "paid") rows = rows.filter((r) => r.paid);
  if (input.paymentStatus === "unpaid") rows = rows.filter((r) => !r.paid);
  rows.sort((a, b) => b.billingMonth.localeCompare(a.billingMonth) || a.residentFullName.localeCompare(b.residentFullName));

  const totalCount = rows.length;
  const summary = {
    totalBilledMinor: rows.reduce((n, r) => n + r.amountMinorSnapshot, 0),
    chargeCount: totalCount,
    paidCount: rows.filter((r) => r.paid).length,
    unpaidCount: rows.filter((r) => !r.paid).length,
    unpaidBalanceMinor: rows.filter((r) => !r.paid).reduce((n, r) => n + r.amountMinorSnapshot, 0),
  };
  const offset = (input.page - 1) * input.pageSize;
  return { rows: rows.slice(offset, offset + input.pageSize), totalCount, page: input.page, pageSize: input.pageSize, summary };
}

export function listHomeOtherChargesLedger(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  input: {
    residentId?: string | null;
    receivedFilter: HomeOtherChargesReceivedFilter;
    page: number;
    pageSize: number;
  },
): {
  rows: HomeOtherChargeLedgerRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  summary: HomeOtherChargesLedgerSummary;
} {
  requireBillingAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);
  if (input.residentId) {
    const resident = db
      .select({ id: residents.id })
      .from(residents)
      .where(and(eq(residents.id, input.residentId), eq(residents.homeId, homeId)))
      .get();
    if (!resident) {
      throw new NotFoundError();
    }
  }
  const rows = db
    .select({ li: invoiceLineItems, resident: residents })
    .from(invoiceLineItems)
    .innerJoin(invoices, eq(invoices.id, invoiceLineItems.invoiceId))
    .innerJoin(residentAccounts, eq(residentAccounts.id, invoices.accountId))
    .innerJoin(residents, eq(residents.id, residentAccounts.residentId))
    .where(eq(residents.homeId, homeId))
    .all()
    .filter((r) => r.li.category === "registration" || r.li.category === "deposit")
    .filter((r) => (input.residentId ? r.resident.id === input.residentId : true))
    .map((r) => {
      const linked = db
        .select({ p: billingPayments })
        .from(billingPayments)
        .innerJoin(billingTransactions, eq(billingTransactions.id, billingPayments.ledgerTransactionId))
        .where(eq(billingTransactions.memo, `other-charge:${r.li.id}`))
        .get();
      return {
        id: r.li.id,
        chargeId: r.li.id,
        residentId: r.resident.id,
        residentFullName: r.resident.fullName,
        residentStatus: r.resident.status,
        type: r.li.category,
        amountMinor: r.li.amountMinor,
        received: Boolean(linked),
        paidOn: linked?.p.receivedOn ?? null,
      };
    })
    .filter((r) => (input.receivedFilter === "paid" ? r.received : input.receivedFilter === "unpaid" ? !r.received : true))
    .sort((a, b) => a.residentFullName.localeCompare(b.residentFullName) || a.type.localeCompare(b.type));

  const totalCount = rows.length;
  const summary = {
    totalRows: totalCount,
    totalAmountMinor: rows.reduce((n, r) => n + r.amountMinor, 0),
    outstandingAmountMinor: rows.filter((r) => !r.received).reduce((n, r) => n + r.amountMinor, 0),
    receivedLineCount: rows.filter((r) => r.received).length,
  };
  const offset = (input.page - 1) * input.pageSize;
  return {
    rows: rows.slice(offset, offset + input.pageSize),
    totalCount,
    page: input.page,
    pageSize: input.pageSize,
    summary,
  };
}

export function listHomeMonthlyPaymentsLedger(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  input: { page: number; pageSize: number },
): { rows: HomeMonthlyPaymentLedgerRow[]; totalCount: number; page: number; pageSize: number } {
  requireBillingAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);
  const rows = db
    .select({ p: billingPayments, txn: billingTransactions, resident: residents, user: users })
    .from(billingPayments)
    .innerJoin(billingTransactions, eq(billingTransactions.id, billingPayments.ledgerTransactionId))
    .innerJoin(residentAccounts, eq(residentAccounts.id, billingPayments.accountId))
    .innerJoin(residents, eq(residents.id, residentAccounts.residentId))
    .leftJoin(users, eq(users.id, billingPayments.recordedByUserId))
    .where(eq(residents.homeId, homeId))
    .orderBy(desc(billingPayments.receivedOn), desc(billingPayments.createdAtUtcMs))
    .all()
    .filter((r) => r.txn.memo?.startsWith("charge:"))
    .map((r) => {
      const chargeId = r.txn.memo!.slice("charge:".length);
      const charge = db.select().from(billingTransactions).where(eq(billingTransactions.id, chargeId)).get();
      const invoice = charge?.sourceId ? db.select().from(invoices).where(eq(invoices.id, charge.sourceId)).get() : null;
      return {
        paymentId: r.p.id,
        chargeId,
        billingMonth: invoice?.billingPeriod ?? "",
        amountMinorSnapshot: charge?.amountMinor,
        residentId: r.resident.id,
        residentFullName: r.resident.fullName,
        residentStatus: r.resident.status,
        amountMinor: r.p.amountMinor,
        paidOn: r.p.receivedOn,
        notes: r.p.notes,
        recordedByUserId: r.p.recordedByUserId,
        recordedByEmail: r.user?.email ?? null,
      };
    });
  const totalCount = rows.length;
  const offset = (input.page - 1) * input.pageSize;
  return { rows: rows.slice(offset, offset + input.pageSize), totalCount, page: input.page, pageSize: input.pageSize };
}

export function listHomeUnpaidMonthlyChargesWorklist(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
): HomeUnpaidMonthlyChargesWorklistEntry[] {
  const rows = listHomeMonthlyChargesLedger(db, actor, homeId, {
    paymentStatus: "unpaid",
    page: 1,
    pageSize: 10000,
  }).rows;
  const byResident = new Map<string, HomeUnpaidMonthlyChargesWorklistEntry>();
  for (const r of rows) {
    const existing = byResident.get(r.residentId) ?? {
      residentId: r.residentId,
      residentFullName: r.residentFullName,
      residentStatus: r.residentStatus,
      oldestUnpaidBillingMonth: r.billingMonth,
      totalUnpaidMinor: 0,
      unpaid: [],
      unpaidCharges: [],
    };
    const item = {
      id: r.id,
      chargeId: r.chargeId,
      billingMonth: r.billingMonth,
      amountMinorSnapshot: r.amountMinorSnapshot,
      wardLabel: r.wardLabelSnapshot,
    };
    existing.unpaid.push(item);
    existing.unpaidCharges?.push(item);
    existing.totalUnpaidMinor = (existing.totalUnpaidMinor ?? 0) + r.amountMinorSnapshot;
    if ((existing.oldestUnpaidBillingMonth ?? r.billingMonth) > r.billingMonth) {
      existing.oldestUnpaidBillingMonth = r.billingMonth;
    }
    byResident.set(r.residentId, existing);
  }
  return [...byResident.values()];
}

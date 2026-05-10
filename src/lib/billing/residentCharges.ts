import { and, desc, eq, sql } from "drizzle-orm";
import { assertActorMayAccessHome } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import {
  billingPayments,
  billingTransactions,
  homes,
  invoices,
  invoiceLineItems,
  accounts,
  residents,
  users,
  wards,
} from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { ForbiddenError, NotFoundError } from "@/lib/homes/errors";
import { utcCalendarDateIsoFromUtcMs } from "@/lib/billing/receivedOnUtcMs";

export type HomeMonthlyChargeLedgerRow = {
  id: string;
  chargeId: string;
  billingMonth: string;
  invoiceLineDescription: string;
  invoiceLineCategory: string;
  invoiceStatus: string;
  wardIdSnapshot?: string;
  wardLabel?: string | null;
  wardLabelSnapshot: string | null;
  amountMinorSnapshot: number;
  paid: boolean;
  paidOn: string | null;
  payment?: null | {
    id: string;
    amountMinor: number;
    paidOn: string | null;
    notes: string | null;
    recordedByUserId: string;
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
  invoiceLineId: string;
  chargeId: string;
  residentId: string;
  residentFullName: string;
  residentStatus: string;
  billingMonth: string;
  invoiceLineDescription: string;
  invoiceLineCategory: string;
  invoiceStatus: string;
  amountMinorSnapshot: number;
  wardIdSnapshot: string | null;
  wardLabelSnapshot: string | null;
};

function requireBillingAdmin(actor: SessionActor | undefined): asserts actor is SessionActor {
  if (!actor || actor.role !== "admin") {
    throw new ForbiddenError();
  }
}

function chargeRowsForHome(
  db: AppDb,
  homeId: string,
  input: { from?: string; to?: string; residentId?: string },
): ChargeCore[] {
  const rows = db
    .select({
      invoice: invoices,
      resident: residents,
      line: invoiceLineItems,
      ward: wards,
    })
    .from(invoiceLineItems)
    .innerJoin(invoices, eq(invoiceLineItems.invoiceId, invoices.id))
    .innerJoin(accounts, eq(accounts.id, invoices.accountId))
    .innerJoin(residents, eq(residents.id, accounts.residentId))
    .leftJoin(wards, eq(wards.id, residents.wardId))
    .where(
      and(
        eq(accounts.accountType, "resident"),
        eq(residents.homeId, homeId),
        input.residentId ? eq(residents.id, input.residentId) : sql`1=1`,
      ),
    )
    .all();

  return rows
    .map((r) => {
      const billingMonth =
        r.line.serviceMonth ??
        (r.invoice.issuedOn && r.invoice.issuedOn.length >= 7
          ? r.invoice.issuedOn.slice(0, 7)
          : null);
      if (!billingMonth) {
        return null;
      }
      return {
        invoiceLineId: r.line.id,
        chargeId: r.line.id,
      residentId: r.resident.id,
      residentFullName: r.resident.fullName,
      residentStatus: r.resident.status,
        billingMonth,
        invoiceLineDescription: r.line.description,
        invoiceLineCategory: r.line.category,
        invoiceStatus: r.invoice.status,
        amountMinorSnapshot: r.line.amountMinor,
        wardIdSnapshot: r.resident.wardId,
        wardLabelSnapshot: r.ward?.label ?? null,
      } satisfies ChargeCore;
    })
    .filter((r): r is ChargeCore => r !== null)
    .filter((r) => (input.from ? r.billingMonth >= input.from : true))
    .filter((r) => (input.to ? r.billingMonth <= input.to : true));
}

export function listHomeMonthlyChargesLedger(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  input: {
    paymentStatus: HomeMonthlyChargesLedgerPaymentStatusFilter;
    residentId?: string | null;
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

  let rows = chargeRowsForHome(db, homeId, {
    from: input.billingMonthFrom,
    to: input.billingMonthTo,
    residentId: input.residentId ?? undefined,
  }).map((c) => ({
    id: c.invoiceLineId,
    chargeId: c.chargeId,
    residentId: c.residentId,
    residentFullName: c.residentFullName,
    residentStatus: c.residentStatus,
    billingMonth: c.billingMonth,
    invoiceLineDescription: c.invoiceLineDescription,
    invoiceLineCategory: c.invoiceLineCategory,
    invoiceStatus: c.invoiceStatus,
    wardIdSnapshot: c.wardIdSnapshot ?? undefined,
    wardLabel: c.wardLabelSnapshot,
    wardLabelSnapshot: c.wardLabelSnapshot,
    amountMinorSnapshot: c.amountMinorSnapshot,
    paid: c.invoiceStatus === "paid",
    paidOn: null,
    payment: null,
  }));
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
    .innerJoin(accounts, eq(accounts.id, invoices.accountId))
    .innerJoin(residents, eq(residents.id, accounts.residentId))
    .where(and(eq(accounts.accountType, "resident"), eq(residents.homeId, homeId)))
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
        paidOn: linked ? utcCalendarDateIsoFromUtcMs(linked.p.receivedOn) : null,
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
  input: { page: number; pageSize: number; residentId?: string | null },
): { rows: HomeMonthlyPaymentLedgerRow[]; totalCount: number; page: number; pageSize: number } {
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
    .select({ p: billingPayments, txn: billingTransactions, resident: residents, user: users })
    .from(billingPayments)
    .innerJoin(billingTransactions, eq(billingTransactions.id, billingPayments.ledgerTransactionId))
    .innerJoin(accounts, eq(accounts.id, billingPayments.accountId))
    .innerJoin(residents, eq(residents.id, accounts.residentId))
    .leftJoin(users, eq(users.id, billingPayments.recordedByUserId))
    .where(
      and(
        eq(accounts.accountType, "resident"),
        eq(residents.homeId, homeId),
        input.residentId ? eq(residents.id, input.residentId) : sql`1=1`,
      ),
    )
    .orderBy(desc(billingPayments.receivedOn))
    .all()
    .filter((r) => !r.txn.memo?.startsWith("other-charge:"))
    .map((r) => {
      const chargeId =
        r.txn.memo?.startsWith("charge:")
          ? r.txn.memo.slice("charge:".length)
          : null;
      const charge = chargeId
        ? db
            .select()
            .from(billingTransactions)
            .where(eq(billingTransactions.id, chargeId))
            .get()
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
        residentId: r.resident.id,
        residentFullName: r.resident.fullName,
        residentStatus: r.resident.status,
        amountMinor: r.p.amountMinor,
        paidOn: utcCalendarDateIsoFromUtcMs(r.p.receivedOn),
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

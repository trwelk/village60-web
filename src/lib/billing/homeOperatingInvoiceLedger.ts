import { and, asc, eq, inArray } from "drizzle-orm";
import { assertActorMayAccessHome } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import { accounts, homes, invoiceLineItems, invoices } from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { ForbiddenError, NotFoundError } from "@/lib/homes/errors";

export type HomeOperatingInvoiceLedgerPaymentStatusFilter = "all" | "paid" | "unpaid";

export type HomeOperatingInvoiceLedgerSummary = {
  totalBilledMinor: number;
  chargeCount: number;
  paidCount: number;
  unpaidCount: number;
  unpaidBalanceMinor: number;
};

export type HomeOperatingInvoiceLedgerRow = {
  id: string;
  invoiceId: string;
  invNo: string | null;
  invoiceStatus: string;
  billingMonth: string;
  issuedOn: string | null;
  amountMinor: number;
  paid: boolean;
};

export const DEFAULT_HOME_OPERATING_INVOICES_PAGE_SIZE = 25;
export const MAX_HOME_OPERATING_INVOICES_PAGE_SIZE = 100;

function requireBillingAdmin(actor: SessionActor | undefined): asserts actor is SessionActor {
  if (!actor || actor.role !== "admin") {
    throw new ForbiddenError();
  }
}

function utcYmFromMillis(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

function effectiveBillingMonth(inv: { issuedOn: string | null; createdAtUtcMs: number }): string {
  const io = inv.issuedOn?.trim();
  if (io && /^\d{4}-\d{2}-\d{2}$/.test(io)) {
    return io.slice(0, 7);
  }
  return utcYmFromMillis(inv.createdAtUtcMs);
}

export function listHomeOperatingInvoiceLedger(
  db: AppDb,
  actor: SessionActor | undefined,
  homeId: string,
  input: {
    paymentStatus: HomeOperatingInvoiceLedgerPaymentStatusFilter;
    billingMonthFrom: string;
    billingMonthTo: string;
    page: number;
    pageSize: number;
  },
): {
  rows: HomeOperatingInvoiceLedgerRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  summary: HomeOperatingInvoiceLedgerSummary;
} {
  requireBillingAdmin(actor);
  assertActorMayAccessHome(db, actor, homeId);
  const home = db.select({ id: homes.id }).from(homes).where(eq(homes.id, homeId)).get();
  if (!home) {
    throw new NotFoundError();
  }

  const invRows = db
    .select({ inv: invoices })
    .from(invoices)
    .innerJoin(accounts, eq(invoices.accountId, accounts.id))
    .where(and(eq(accounts.accountType, "home"), eq(accounts.homeId, homeId)))
    .all();

  const ids = invRows.map((r) => r.inv.id);

  type LineAgg = { sumMinor: number };
  const lineAgg = new Map<string, LineAgg>();
  if (ids.length > 0) {
    const lines = db
      .select()
      .from(invoiceLineItems)
      .where(inArray(invoiceLineItems.invoiceId, ids))
      .orderBy(asc(invoiceLineItems.createdAtUtcMs), asc(invoiceLineItems.id))
      .all();
    for (const li of lines) {
      const cur = lineAgg.get(li.invoiceId);
      if (!cur) {
        lineAgg.set(li.invoiceId, { sumMinor: li.amountMinor });
      } else {
        cur.sumMinor += li.amountMinor;
      }
    }
  }

  const baseRows: HomeOperatingInvoiceLedgerRow[] = [];
  for (const { inv } of invRows) {
    const billingMonth = effectiveBillingMonth(inv);
    const agg = lineAgg.get(inv.id);
    const amountMinor = inv.totalMinorSnapshot ?? agg?.sumMinor ?? 0;
    const paid = inv.status === "paid";
    baseRows.push({
      id: inv.id,
      invoiceId: inv.id,
      invNo: inv.invNo,
      invoiceStatus: inv.status,
      billingMonth,
      issuedOn: inv.issuedOn ?? null,
      amountMinor,
      paid,
    });
  }

  let filtered = baseRows.filter(
    (r) => r.billingMonth >= input.billingMonthFrom && r.billingMonth <= input.billingMonthTo,
  );
  filtered.sort(
    (a, b) =>
      b.billingMonth.localeCompare(a.billingMonth) ||
      String(b.invNo ?? "").localeCompare(String(a.invNo ?? "")) ||
      a.invoiceId.localeCompare(b.invoiceId),
  );

  if (input.paymentStatus === "paid") {
    filtered = filtered.filter((r) => r.paid);
  } else if (input.paymentStatus === "unpaid") {
    filtered = filtered.filter((r) => !r.paid);
  }

  const totalCount = filtered.length;
  const summary: HomeOperatingInvoiceLedgerSummary = {
    totalBilledMinor: filtered.reduce((n, r) => n + r.amountMinor, 0),
    chargeCount: totalCount,
    paidCount: filtered.filter((r) => r.paid).length,
    unpaidCount: filtered.filter((r) => !r.paid).length,
    unpaidBalanceMinor: filtered.filter((r) => !r.paid).reduce((n, r) => n + r.amountMinor, 0),
  };

  const page = Math.max(1, input.page);
  const pageSize = Math.min(
    MAX_HOME_OPERATING_INVOICES_PAGE_SIZE,
    Math.max(1, input.pageSize),
  );
  const offset = (page - 1) * pageSize;
  const rows = filtered.slice(offset, offset + pageSize);

  return { rows, totalCount, page, pageSize, summary };
}

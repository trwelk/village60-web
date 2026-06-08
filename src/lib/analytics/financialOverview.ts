import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import {
  accounts,
  billingPayments,
  billingTransactions,
  homes,
  invoiceLineItems,
  invoices,
  residents,
  wards,
} from "@/db/schema";
import {
  shiftBillingMonth,
  utcBillingMonthFromMs,
} from "@/lib/billing/billingMonth";
import type { AppDb } from "@/lib/homes/service";

export type FinancialPreset = "6" | "12" | "ytd";

export type MonthCashFlowDatum = {
  monthKey: string;
  monthLabelShort: string;
  collectedMinor: number;
  expensesMinor: number;
  /** Payments on home billing accounts toward invoices (`received_on` month). */
  homeInvoicePaymentMinor: number;
  /** Collected − expenses for this month only (UTC buckets differ by source). */
  netMinor: number;
  /** Finalized invoice snapshot totals with `issued_on` in this month. */
  finalizedInvoicedMinor: number;
  /** Running Σ collected − Σ expenses through this month (period cash net). */
  cumNetCashMinor: number;
  /**
   * Cumulative cash net plus current outstanding receivables (resident ledger
   * snapshot, same scope as KPI). Illustrative if remaining balances were collected.
   */
  cumPotentialNetMinor: number;
};

export type FinancialOverviewKpis = {
  totalCollectedMinor: number;
  totalExpensesMinor: number;
  netMinor: number;
  outstandingReceivablesMinor: number;
};

export type InvoiceStatusMonthDatum = {
  monthKey: string;
  monthLabelShort: string;
  draftMinor: number;
  finalizedMinor: number;
};

export type NamedAmountDatum = { label: string; amountMinor: number };

export type OutstandingRow = {
  homeId: string;
  residentId: string;
  fullName: string;
  balanceMinor: number;
};

export type FinancialAnalyticsSnapshot = {
  currencyCode: string;
  preset: FinancialPreset;
  startMonth: string;
  endMonth: string;
  kpis: FinancialOverviewKpis;
  monthlyCashFlow: MonthCashFlowDatum[];
  invoiceVolumeByStatusMonth: InvoiceStatusMonthDatum[];
  revenueByCategory: NamedAmountDatum[];
  revenueBySegment: NamedAmountDatum[];
  paidInvoiceCategories: NamedAmountDatum[];
  revenueSegmentKind: "ward" | "home";
  topOutstanding: OutstandingRow[];
  projectedMonthlyCapacityMinor: number;
  monthlyFeesBilledInRangeMinor: number;
  yieldPercent: number | null;
};

const shortMonthUtc = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
});

function shortMonthLabelFromKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return shortMonthUtc.format(new Date(Date.UTC(y, m - 1, 1)));
}

function nonArchivedHomesClause() {
  return isNull(homes.archivedAtUtcMs);
}

export function resolveFinancialMonthRange(
  atUtcMs: number,
  preset: FinancialPreset,
): { startMonth: string; endMonth: string } {
  const endMonth = utcBillingMonthFromMs(atUtcMs);
  if (preset === "12") {
    return { startMonth: shiftBillingMonth(endMonth, -11), endMonth };
  }
  if (preset === "6") {
    return { startMonth: shiftBillingMonth(endMonth, -5), endMonth };
  }
  const d = new Date(atUtcMs);
  const y = d.getUTCFullYear();
  const startMonth = `${String(y).padStart(4, "0")}-01`;
  return { startMonth, endMonth };
}

function invoicesHomeScope(homeId: string | null) {
  if (!homeId) return undefined;
  return eq(invoices.homeId, homeId);
}

/** Sum bed × monthly rate for configured wards (non-archived homes / wards). */
export function sumProjectedMonthlyCapacityMinor(
  db: AppDb,
  homeId: string | null,
): number {
  const conditions = [
    isNull(homes.archivedAtUtcMs),
    isNull(wards.archivedAtUtcMs),
    isNotNull(wards.bedCount),
    isNotNull(wards.monthlyRatePerPersonMinor),
  ];
  if (homeId) {
    conditions.push(eq(wards.homeId, homeId));
  }
  const row = db
    .select({
      total: sql<number>`ifnull(sum(${wards.bedCount} * ${wards.monthlyRatePerPersonMinor}), 0)`,
    })
    .from(wards)
    .innerJoin(homes, eq(wards.homeId, homes.id))
    .where(and(...conditions))
    .get();
  return Number(row?.total ?? 0);
}

export function getFinancialAnalyticsSnapshot(
  db: AppDb,
  input: {
    atUtcMs: number;
    preset: FinancialPreset;
    homeId: string | null;
    displayCurrencyCode: string;
  },
): FinancialAnalyticsSnapshot {
  const { startMonth, endMonth } = resolveFinancialMonthRange(
    input.atUtcMs,
    input.preset,
  );

  const receivedMonthClause = and(
    gte(sql`strftime('%Y-%m', ${billingPayments.receivedOn} / 1000, 'unixepoch')`, startMonth),
    lte(sql`strftime('%Y-%m', ${billingPayments.receivedOn} / 1000, 'unixepoch')`, endMonth),
  );

  const issuedMonthClause = and(
    isNotNull(invoices.issuedOn),
    gte(sql`substr(${invoices.issuedOn}, 1, 7)`, startMonth),
    lte(sql`substr(${invoices.issuedOn}, 1, 7)`, endMonth),
  );

  const serviceMonthClause = and(
    isNotNull(invoiceLineItems.serviceMonth),
    gte(invoiceLineItems.serviceMonth, startMonth),
    lte(invoiceLineItems.serviceMonth, endMonth),
    eq(invoiceLineItems.category, "monthly_fee"),
  );

  const collectedResident = db
    .select({
      total: sql<number>`ifnull(sum(${billingPayments.amountMinor}), 0)`,
    })
    .from(billingPayments)
    .innerJoin(accounts, eq(accounts.id, billingPayments.accountId))
    .innerJoin(residents, eq(residents.id, accounts.residentId))
    .innerJoin(homes, eq(homes.id, residents.homeId))
    .where(
      and(
        eq(accounts.accountType, "resident"),
        receivedMonthClause,
        nonArchivedHomesClause(),
        input.homeId ? eq(residents.homeId, input.homeId) : sql`1 = 1`,
      ),
    )
    .get();

  const collectedHomeAcct = db
    .select({
      total: sql<number>`ifnull(sum(${billingPayments.amountMinor}), 0)`,
    })
    .from(billingPayments)
    .innerJoin(accounts, eq(accounts.id, billingPayments.accountId))
    .innerJoin(homes, eq(homes.id, accounts.homeId))
    .where(
      and(
        eq(accounts.accountType, "home"),
        receivedMonthClause,
        nonArchivedHomesClause(),
        input.homeId ? eq(accounts.homeId, input.homeId) : sql`1 = 1`,
      ),
    )
    .get();

  /** Resident payments only — cash received from resident billing. */
  const totalCollectedMinor = Number(collectedResident?.total ?? 0);

  const totalHomeInvoicePaymentsMinor = Number(collectedHomeAcct?.total ?? 0);
  const totalExpensesMinor = totalHomeInvoicePaymentsMinor;

  const balancePredicates = [
    eq(accounts.accountType, "resident"),
    input.homeId ? eq(residents.homeId, input.homeId) : sql`1 = 1`,
  ];

  const balanceByAccount = db
    .select({
      accountId: billingTransactions.accountId,
      balance: sql<number>`ifnull(sum(${billingTransactions.amountMinor}), 0)`,
    })
    .from(billingTransactions)
    .innerJoin(accounts, eq(accounts.id, billingTransactions.accountId))
    .innerJoin(residents, eq(residents.id, accounts.residentId))
    .where(and(...balancePredicates))
    .groupBy(billingTransactions.accountId)
    .all();

  let outstandingReceivablesMinor = 0;
  for (const row of balanceByAccount) {
    const b = Number(row.balance);
    if (b > 0) {
      outstandingReceivablesMinor += b;
    }
  }

  const finalizedIssuedByMonth = db
    .select({
      monthKey: sql<string>`substr(${invoices.issuedOn}, 1, 7)`,
      total: sql<number>`ifnull(sum(${invoices.totalMinorSnapshot}), 0)`,
    })
    .from(invoices)
    .where(
      and(
        issuedMonthClause,
        ...(input.homeId ? [eq(invoices.homeId, input.homeId)] : []),
        eq(invoices.status, "finalized"),
        isNotNull(invoices.totalMinorSnapshot),
      ),
    )
    .groupBy(sql`substr(${invoices.issuedOn}, 1, 7)`)
    .all();

  const finalizedInvoicedMap = new Map(
    finalizedIssuedByMonth.map((r) => [r.monthKey, Number(r.total)]),
  );

  const monthlyCashFlow: MonthCashFlowDatum[] = [];
  let cumCollected = 0;
  let cumExpenses = 0;
  let cursor = startMonth;
  while (cursor <= endMonth) {
    const monthKey = cursor;

    const cr = db
      .select({
        total: sql<number>`ifnull(sum(${billingPayments.amountMinor}), 0)`,
      })
      .from(billingPayments)
      .innerJoin(accounts, eq(accounts.id, billingPayments.accountId))
      .innerJoin(residents, eq(residents.id, accounts.residentId))
      .innerJoin(homes, eq(homes.id, residents.homeId))
      .where(
        and(
          eq(accounts.accountType, "resident"),
          eq(sql`strftime('%Y-%m', ${billingPayments.receivedOn} / 1000, 'unixepoch')`, monthKey),
          nonArchivedHomesClause(),
          input.homeId ? eq(residents.homeId, input.homeId) : sql`1 = 1`,
        ),
      )
      .get();

    const ch = db
      .select({
        total: sql<number>`ifnull(sum(${billingPayments.amountMinor}), 0)`,
      })
      .from(billingPayments)
      .innerJoin(accounts, eq(accounts.id, billingPayments.accountId))
      .innerJoin(homes, eq(homes.id, accounts.homeId))
      .where(
        and(
          eq(accounts.accountType, "home"),
          eq(sql`strftime('%Y-%m', ${billingPayments.receivedOn} / 1000, 'unixepoch')`, monthKey),
          nonArchivedHomesClause(),
          input.homeId ? eq(accounts.homeId, input.homeId) : sql`1 = 1`,
        ),
      )
      .get();

    const collectedMinor = Number(cr?.total ?? 0);
    const homeInvoicePaymentMinor = Number(ch?.total ?? 0);
    const expensesMinor = homeInvoicePaymentMinor;
    const finalizedInvoicedMinor =
      finalizedInvoicedMap.get(monthKey) ?? 0;

    cumCollected += collectedMinor;
    cumExpenses += expensesMinor;

    monthlyCashFlow.push({
      monthKey,
      monthLabelShort: shortMonthLabelFromKey(monthKey),
      collectedMinor,
      expensesMinor,
      homeInvoicePaymentMinor,
      netMinor: collectedMinor - expensesMinor,
      finalizedInvoicedMinor,
      cumNetCashMinor: cumCollected - cumExpenses,
      cumPotentialNetMinor:
        cumCollected - cumExpenses + outstandingReceivablesMinor,
    });

    cursor = shiftBillingMonth(cursor, 1);
  }

  const invoiceStatusRows = db
    .select({
      monthKey: sql<string>`substr(${invoices.issuedOn}, 1, 7)`,
      status: invoices.status,
      total: sql<number>`ifnull(sum(${invoices.totalMinorSnapshot}), 0)`,
    })
    .from(invoices)
    .where(
      and(
        issuedMonthClause,
        ...(input.homeId ? [eq(invoices.homeId, input.homeId)] : []),
        isNotNull(invoices.totalMinorSnapshot),
      ),
    )
    .groupBy(sql`substr(${invoices.issuedOn}, 1, 7)`, invoices.status)
    .all();

  const invoiceVolumeByStatusMonth: InvoiceStatusMonthDatum[] = [];
  cursor = startMonth;
  while (cursor <= endMonth) {
    const mk = cursor;
    const draftMinor = invoiceStatusRows
      .filter((r) => r.monthKey === mk && r.status === "draft")
      .reduce((s, r) => s + Number(r.total), 0);
    const finalizedMinor = invoiceStatusRows
      .filter((r) => r.monthKey === mk && r.status === "finalized")
      .reduce((s, r) => s + Number(r.total), 0);
    invoiceVolumeByStatusMonth.push({
      monthKey: mk,
      monthLabelShort: shortMonthLabelFromKey(mk),
      draftMinor,
      finalizedMinor,
    });
    cursor = shiftBillingMonth(cursor, 1);
  }

  const categoryPredicates = [
    issuedMonthClause,
    invoicesHomeScope(input.homeId),
    eq(invoices.status, "finalized"),
  ].filter(Boolean);

  const categoryRows = db
    .select({
      category: invoiceLineItems.category,
      total: sql<number>`ifnull(sum(${invoiceLineItems.amountMinor}), 0)`,
    })
    .from(invoiceLineItems)
    .innerJoin(invoices, eq(invoices.id, invoiceLineItems.invoiceId))
    .where(and(...categoryPredicates))
    .groupBy(invoiceLineItems.category)
    .orderBy(asc(invoiceLineItems.category))
    .all();

  const revenueByCategory: NamedAmountDatum[] = categoryRows.map((r) => ({
    label: r.category,
    amountMinor: Number(r.total),
  }));

  const paidCategoryPredicates = [
    issuedMonthClause,
    invoicesHomeScope(input.homeId),
    eq(invoices.status, "paid"),
  ].filter(Boolean);

  const paidCategoryRows = db
    .select({
      category: invoiceLineItems.category,
      total: sql<number>`ifnull(sum(${invoiceLineItems.amountMinor}), 0)`,
    })
    .from(invoiceLineItems)
    .innerJoin(invoices, eq(invoices.id, invoiceLineItems.invoiceId))
    .where(and(...paidCategoryPredicates))
    .groupBy(invoiceLineItems.category)
    .orderBy(asc(invoiceLineItems.category))
    .all();

  const paidInvoiceCategories: NamedAmountDatum[] = paidCategoryRows.map((r) => ({
    label: r.category,
    amountMinor: Number(r.total),
  }));

  let revenueSegmentKind: "ward" | "home" = "home";
  let revenueBySegment: NamedAmountDatum[] = [];

  if (input.homeId) {
    revenueSegmentKind = "ward";
    const wardRows = db
      .select({
        segment: sql<string>`coalesce(${wards.label}, 'Unassigned')`,
        total: sql<number>`ifnull(sum(${billingPayments.amountMinor}), 0)`,
      })
      .from(billingPayments)
      .innerJoin(accounts, eq(accounts.id, billingPayments.accountId))
      .innerJoin(residents, eq(residents.id, accounts.residentId))
      .leftJoin(wards, eq(wards.id, residents.wardId))
      .where(
        and(
          eq(accounts.accountType, "resident"),
          receivedMonthClause,
          eq(residents.homeId, input.homeId),
        ),
      )
      .groupBy(sql`coalesce(${wards.label}, 'Unassigned')`)
      .orderBy(sql`coalesce(${wards.label}, 'Unassigned')`)
      .all();
    revenueBySegment = wardRows.map((r) => ({
      label: r.segment,
      amountMinor: Number(r.total),
    }));
  } else {
    const residentHomeRows = db
      .select({
        homeId: residents.homeId,
        homeName: homes.name,
        total: sql<number>`ifnull(sum(${billingPayments.amountMinor}), 0)`,
      })
      .from(billingPayments)
      .innerJoin(accounts, eq(accounts.id, billingPayments.accountId))
      .innerJoin(residents, eq(residents.id, accounts.residentId))
      .innerJoin(homes, eq(homes.id, residents.homeId))
      .where(
        and(
          eq(accounts.accountType, "resident"),
          receivedMonthClause,
          nonArchivedHomesClause(),
        ),
      )
      .groupBy(residents.homeId, homes.name)
      .orderBy(asc(homes.name))
      .all();

    revenueBySegment = residentHomeRows.map((r) => ({
      label: r.homeName,
      amountMinor: Number(r.total),
    }));
  }

  const outstandingAccounts = db
    .select({
      accountId: billingTransactions.accountId,
      balance: sql<number>`ifnull(sum(${billingTransactions.amountMinor}), 0)`,
    })
    .from(billingTransactions)
    .innerJoin(accounts, eq(accounts.id, billingTransactions.accountId))
    .innerJoin(residents, eq(residents.id, accounts.residentId))
    .where(
      and(
        eq(accounts.accountType, "resident"),
        input.homeId ? eq(residents.homeId, input.homeId) : sql`1 = 1`,
      ),
    )
    .groupBy(billingTransactions.accountId)
    .all();

  const topOutstanding: OutstandingRow[] = [];
  const positive = outstandingAccounts
    .map((r) => ({
      accountId: r.accountId,
      balanceMinor: Number(r.balance),
    }))
    .filter((r) => r.balanceMinor > 0)
    .sort((a, b) => b.balanceMinor - a.balanceMinor)
    .slice(0, 8);

  for (const row of positive) {
    const resRow = db
      .select({
        homeId: residents.homeId,
        residentId: residents.id,
        fullName: residents.fullName,
      })
      .from(accounts)
      .innerJoin(residents, eq(residents.id, accounts.residentId))
      .where(eq(accounts.id, row.accountId))
      .get();
    if (resRow) {
      topOutstanding.push({
        homeId: resRow.homeId,
        residentId: resRow.residentId,
        fullName: resRow.fullName,
        balanceMinor: row.balanceMinor,
      });
    }
  }

  const projectedMonthlyCapacityMinor = sumProjectedMonthlyCapacityMinor(
    db,
    input.homeId,
  );

  const monthlyFeePredicates = [
    serviceMonthClause,
    invoicesHomeScope(input.homeId),
    eq(invoices.status, "finalized"),
  ].filter(Boolean);

  const monthlyFeesRow = db
    .select({
      total: sql<number>`ifnull(sum(${invoiceLineItems.amountMinor}), 0)`,
    })
    .from(invoiceLineItems)
    .innerJoin(invoices, eq(invoices.id, invoiceLineItems.invoiceId))
    .where(and(...monthlyFeePredicates))
    .get();

  const monthlyFeesBilledInRangeMinor = Number(monthlyFeesRow?.total ?? 0);

  let monthsSpan = 1;
  {
    let c = startMonth;
    while (c < endMonth) {
      monthsSpan++;
      c = shiftBillingMonth(c, 1);
    }
  }

  const capacityOverPeriod = projectedMonthlyCapacityMinor * monthsSpan;
  const yieldPercent =
    capacityOverPeriod > 0
      ? Math.round((100 * monthlyFeesBilledInRangeMinor) / capacityOverPeriod)
      : null;

  return {
    currencyCode: input.displayCurrencyCode,
    preset: input.preset,
    startMonth,
    endMonth,
    kpis: {
      totalCollectedMinor,
      totalExpensesMinor,
      netMinor: totalCollectedMinor - totalExpensesMinor,
      outstandingReceivablesMinor,
    },
    monthlyCashFlow,
    invoiceVolumeByStatusMonth,
    revenueByCategory,
    paidInvoiceCategories,
    revenueBySegment,
    revenueSegmentKind,
    topOutstanding,
    projectedMonthlyCapacityMinor,
    monthlyFeesBilledInRangeMinor,
    yieldPercent,
  };
}

export type ExpenseAnalyticsSnapshot = {
  currencyCode: string;
  startMonth: string;
  endMonth: string;
  totalExpensesMinor: number;
  homeInvoicePaymentsMinor: number;
  homeOutstandingReceivablesMinor: number;
  /** Finalized and paid home-account invoice lines, grouped by line item category (`issuedOn` in range). */
  expensesByCategory: NamedAmountDatum[];
};

export function getExpenseAnalyticsSnapshot(
  db: AppDb,
  input: {
    atUtcMs: number;
    preset: FinancialPreset;
    homeId: string | null;
    displayCurrencyCode: string;
  },
): ExpenseAnalyticsSnapshot {
  const { startMonth, endMonth } = resolveFinancialMonthRange(
    input.atUtcMs,
    input.preset,
  );

  const receivedMonthClause = and(
    gte(sql`strftime('%Y-%m', ${billingPayments.receivedOn} / 1000, 'unixepoch')`, startMonth),
    lte(sql`strftime('%Y-%m', ${billingPayments.receivedOn} / 1000, 'unixepoch')`, endMonth),
  );

  const issuedMonthClause = and(
    isNotNull(invoices.issuedOn),
    gte(sql`substr(${invoices.issuedOn}, 1, 7)`, startMonth),
    lte(sql`substr(${invoices.issuedOn}, 1, 7)`, endMonth),
  );

  const homeInvoicePaymentsRow = db
    .select({
      total: sql<number>`ifnull(sum(${billingPayments.amountMinor}), 0)`,
    })
    .from(billingPayments)
    .innerJoin(accounts, eq(accounts.id, billingPayments.accountId))
    .innerJoin(homes, eq(homes.id, accounts.homeId))
    .where(
      and(
        eq(accounts.accountType, "home"),
        receivedMonthClause,
        isNull(homes.archivedAtUtcMs),
        input.homeId ? eq(accounts.homeId, input.homeId) : sql`1 = 1`,
      ),
    )
    .get();

  const homeInvoicePaymentsMinor = Number(homeInvoicePaymentsRow?.total ?? 0);

  const homeOutstandingRows = db
    .select({
      accountId: billingTransactions.accountId,
      balance: sql<number>`ifnull(sum(${billingTransactions.amountMinor}), 0)`,
    })
    .from(billingTransactions)
    .innerJoin(accounts, eq(accounts.id, billingTransactions.accountId))
    .innerJoin(homes, eq(homes.id, accounts.homeId))
    .where(
      and(
        eq(accounts.accountType, "home"),
        isNull(homes.archivedAtUtcMs),
        input.homeId ? eq(accounts.homeId, input.homeId) : sql`1 = 1`,
      ),
    )
    .groupBy(billingTransactions.accountId)
    .all();

  let homeOutstandingReceivablesMinor = 0;
  for (const row of homeOutstandingRows) {
    const b = Number(row.balance);
    if (b > 0) {
      homeOutstandingReceivablesMinor += b;
    }
  }

  const homeExpenseCategoryPredicates = [
    issuedMonthClause,
    inArray(invoices.status, ["finalized", "paid"]),
    eq(accounts.accountType, "home"),
    isNull(homes.archivedAtUtcMs),
    input.homeId ? eq(accounts.homeId, input.homeId) : sql`1 = 1`,
  ];

  const homeExpenseCategoryRows = db
    .select({
      category: invoiceLineItems.category,
      total: sql<number>`ifnull(sum(${invoiceLineItems.amountMinor}), 0)`,
    })
    .from(invoiceLineItems)
    .innerJoin(invoices, eq(invoices.id, invoiceLineItems.invoiceId))
    .innerJoin(accounts, eq(accounts.id, invoices.accountId))
    .innerJoin(homes, eq(homes.id, accounts.homeId))
    .where(and(...homeExpenseCategoryPredicates))
    .groupBy(invoiceLineItems.category)
    .orderBy(asc(invoiceLineItems.category))
    .all();

  const totalExpensesMinor = homeInvoicePaymentsMinor;
  const expensesByCategory = homeExpenseCategoryRows.map((r) => ({
    label: r.category.trim() ? r.category : "Uncategorized",
    amountMinor: Number(r.total),
  }));

  return {
    currencyCode: input.displayCurrencyCode,
    startMonth,
    endMonth,
    totalExpensesMinor,
    homeInvoicePaymentsMinor,
    homeOutstandingReceivablesMinor,
    expensesByCategory,
  };
}

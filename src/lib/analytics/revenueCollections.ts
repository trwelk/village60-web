import { and, asc, eq, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";
import {
  billingPayments,
  billingTransactions,
  homes,
  invoices,
  accounts,
  residents,
} from "@/db/schema";
import { utcBillingMonthFromMs } from "@/lib/billing/billingMonth";
import type { AppDb } from "@/lib/homes/service";

/** Move `YYYY-MM` by `deltaMonths` (UTC calendar months). */
export function shiftBillingMonth(ym: string, deltaMonths: number): string {
  const [yStr, mStr] = ym.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const idx = y * 12 + (m - 1) + deltaMonths;
  const ny = Math.floor(idx / 12);
  const nm = idx - ny * 12 + 1;
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}`;
}

/**
 * Calendar days from the last day of `billingMonth` (`YYYY-MM`) to `paidOn` (`YYYY-MM-DD`), UTC.
 * Negative values are clamped to 0 (paid on or before month end).
 */
export function paymentLagDaysFromMonthEnd(
  billingMonth: string,
  paidOn: string,
): number {
  const [py, pm, pd] = paidOn.split("-").map(Number);
  const paidDay = Math.floor(Date.UTC(py, pm - 1, pd) / 86_400_000);

  const [by, bm] = billingMonth.split("-").map(Number);
  const lastDom = new Date(Date.UTC(by, bm, 0)).getUTCDate();
  const endDay = Math.floor(Date.UTC(by, bm - 1, lastDom) / 86_400_000);

  return Math.max(0, paidDay - endDay);
}

/** Collected ÷ billed × 100 for the current month; null when billed is 0. */
export function collectionRatePercent(
  billedMinor: number,
  collectedMinor: number,
): number | null {
  if (billedMinor <= 0) {
    return null;
  }
  return Math.round((100 * collectedMinor) / billedMinor);
}

export function sumBilledForBillingMonth(
  db: AppDb,
  billingMonth: string,
): number {
  const row = db
    .select({
      total: sql<number>`ifnull(sum(${billingTransactions.amountMinor}), 0)`,
    })
    .from(billingTransactions)
    .innerJoin(
      invoices,
      and(
        eq(billingTransactions.sourceKind, "invoice"),
        eq(billingTransactions.sourceId, invoices.id),
      ),
    )
    .where(
      and(
        eq(billingTransactions.txnType, "charge"),
        sql`substr(${invoices.issuedOn}, 1, 7) = ${billingMonth}`,
      ),
    )
    .get();
  return Number(row?.total ?? 0);
}

export function sumCollectedForBillingMonth(
  db: AppDb,
  billingMonth: string,
): number {
  const row = db
    .select({
      total: sql<number>`ifnull(sum(${billingPayments.amountMinor}), 0)`,
    })
    .from(billingPayments)
    .where(sql`substr(${billingPayments.receivedOn}, 1, 7) = ${billingMonth}`)
    .get();
  return Number(row?.total ?? 0);
}

export function sumOutstandingUnpaidMinor(db: AppDb): number {
  const row = db
    .select({
      total: sql<number>`ifnull(sum(${billingTransactions.amountMinor}), 0)`,
    })
    .from(billingTransactions)
    .get();
  return Math.max(0, Number(row?.total ?? 0));
}

export type RevenueKpis = {
  billingMonthCurrent: string;
  monthlyBilledMinor: number;
  previousMonthBilledMinor: number;
  momDeltaMinor: number;
  momDeltaPercent: number | null;
  collectionRatePercent: number | null;
  outstandingUnpaidMinor: number;
};

export function getRevenueKpis(db: AppDb, atUtcMs: number): RevenueKpis {
  const billingMonthCurrent = utcBillingMonthFromMs(atUtcMs);
  const prev = shiftBillingMonth(billingMonthCurrent, -1);
  const monthlyBilledMinor = sumBilledForBillingMonth(
    db,
    billingMonthCurrent,
  );
  const previousMonthBilledMinor = sumBilledForBillingMonth(db, prev);
  const momDeltaMinor = monthlyBilledMinor - previousMonthBilledMinor;
  const momDeltaPercent =
    previousMonthBilledMinor > 0
      ? Math.round((100 * momDeltaMinor) / previousMonthBilledMinor)
      : null;
  const collected = sumCollectedForBillingMonth(db, billingMonthCurrent);
  return {
    billingMonthCurrent,
    monthlyBilledMinor,
    previousMonthBilledMinor,
    momDeltaMinor,
    momDeltaPercent,
    collectionRatePercent: collectionRatePercent(
      monthlyBilledMinor,
      collected,
    ),
    outstandingUnpaidMinor: sumOutstandingUnpaidMinor(db),
  };
}

export type BilledVsCollectedMonthDatum = {
  monthKey: string;
  monthLabelShort: string;
  billedMinor: number;
  collectedMinor: number;
};

const shortMonthUtc = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
});

function shortMonthLabelFromKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return shortMonthUtc.format(new Date(Date.UTC(y, m - 1, 1)));
}

/** Rolling 12 UTC calendar months ending at the month of `atUtcMs`; missing months are zero-filled. */
export function listTwelveMonthBilledVsCollected(
  db: AppDb,
  atUtcMs: number,
): BilledVsCollectedMonthDatum[] {
  const endMonth = utcBillingMonthFromMs(atUtcMs);
  const startMonth = shiftBillingMonth(endMonth, -11);

  const agg = db
    .select({
      monthKey: sql<string>`substr(${invoices.issuedOn}, 1, 7)`,
      billedMinor: sql<number>`ifnull(sum(${billingTransactions.amountMinor}), 0)`,
      collectedMinor: sql<number>`0`,
    })
    .from(invoices)
    .leftJoin(
      billingTransactions,
      and(
        eq(billingTransactions.sourceKind, "invoice"),
        eq(billingTransactions.sourceId, invoices.id),
        eq(billingTransactions.txnType, "charge"),
      ),
    )
    .where(
      and(
        isNotNull(invoices.issuedOn),
        gte(sql`substr(${invoices.issuedOn}, 1, 7)`, startMonth),
        lte(sql`substr(${invoices.issuedOn}, 1, 7)`, endMonth),
      ),
    )
    .groupBy(sql`substr(${invoices.issuedOn}, 1, 7)`)
    .all();

  const collectedAgg = db
    .select({
      monthKey: sql<string>`substr(${billingPayments.receivedOn}, 1, 7)`,
      collectedMinor: sql<number>`ifnull(sum(${billingPayments.amountMinor}), 0)`,
    })
    .from(billingPayments)
    .where(
      and(
        gte(sql`substr(${billingPayments.receivedOn}, 1, 7)`, startMonth),
        lte(sql`substr(${billingPayments.receivedOn}, 1, 7)`, endMonth),
      ),
    )
    .groupBy(sql`substr(${billingPayments.receivedOn}, 1, 7)`)
    .all();

  const byMonth = new Map(
    agg.map((r) => [
      r.monthKey,
      {
        billedMinor: Number(r.billedMinor),
        collectedMinor: Number(r.collectedMinor),
      },
    ]),
  );
  for (const row of collectedAgg) {
    const existing = byMonth.get(row.monthKey) ?? { billedMinor: 0, collectedMinor: 0 };
    existing.collectedMinor = Number(row.collectedMinor);
    byMonth.set(row.monthKey, existing);
  }

  const out: BilledVsCollectedMonthDatum[] = [];
  let cursor = startMonth;
  while (cursor <= endMonth) {
    const pair = byMonth.get(cursor) ?? { billedMinor: 0, collectedMinor: 0 };
    out.push({
      monthKey: cursor,
      monthLabelShort: shortMonthLabelFromKey(cursor),
      billedMinor: pair.billedMinor,
      collectedMinor: pair.collectedMinor,
    });
    cursor = shiftBillingMonth(cursor, 1);
  }
  return out;
}

export type PaymentLagByHomeDatum = {
  homeId: string;
  homeName: string;
  averageLagDays: number;
  hasPayments: boolean;
};

/**
 * Non-archived homes only. Average lag = mean days from billing month end to `paid_on`
 * over all payments for residents in that home. Homes with no payments: 0 days and `hasPayments: false`.
 */
export function listPaymentLagByHome(db: AppDb): PaymentLagByHomeDatum[] {
  const homeRows = db
    .select({ id: homes.id, name: homes.name })
    .from(homes)
    .where(isNull(homes.archivedAtUtcMs))
    .orderBy(asc(homes.name))
    .all();

  const chargeRows = db
    .select({
      accountId: billingTransactions.accountId,
      postedAtUtcMs: billingTransactions.postedAtUtcMs,
      billingMonth: sql<string>`substr(${invoices.issuedOn}, 1, 7)`,
    })
    .from(billingTransactions)
    .innerJoin(
      invoices,
      and(
        eq(billingTransactions.sourceKind, "invoice"),
        eq(billingTransactions.sourceId, invoices.id),
        eq(billingTransactions.txnType, "charge"),
      ),
    )
    .all();

  const paymentRows = db
    .select({
      homeId: residents.homeId,
      receivedOn: billingPayments.receivedOn,
      accountId: billingPayments.accountId,
      payPostedMs: billingTransactions.postedAtUtcMs,
    })
    .from(billingPayments)
    .innerJoin(
      billingTransactions,
      eq(billingPayments.ledgerTransactionId, billingTransactions.id),
    )
    .innerJoin(accounts, eq(accounts.id, billingPayments.accountId))
    .innerJoin(residents, eq(residents.id, accounts.residentId))
    .innerJoin(homes, eq(homes.id, residents.homeId))
    .where(and(eq(accounts.accountType, "resident"), isNull(homes.archivedAtUtcMs)))
    .all();

  const chargesByAccount = new Map<string, { postedAtUtcMs: number; billingMonth: string }[]>();
  for (const c of chargeRows) {
    if (c.billingMonth == null || c.billingMonth === "") continue;
    const list = chargesByAccount.get(c.accountId) ?? [];
    list.push({ postedAtUtcMs: c.postedAtUtcMs, billingMonth: c.billingMonth });
    chargesByAccount.set(c.accountId, list);
  }

  const lagValuesByHome = new Map<string, number[]>();
  for (const p of paymentRows) {
    const list = chargesByAccount.get(p.accountId) ?? [];
    const prior = list.filter(
      (c) => c.postedAtUtcMs <= p.payPostedMs && c.billingMonth != null,
    );
    if (prior.length === 0) continue;
    let best = prior[0]!;
    for (const row of prior) {
      if (row.postedAtUtcMs > best.postedAtUtcMs) {
        best = row;
      }
    }
    const lag = paymentLagDaysFromMonthEnd(best.billingMonth, p.receivedOn);
    const acc = lagValuesByHome.get(p.homeId) ?? [];
    acc.push(lag);
    lagValuesByHome.set(p.homeId, acc);
  }

  const mapped = homeRows.map((h) => {
    const list = lagValuesByHome.get(h.id);
    if (!list?.length) {
      return {
        homeId: h.id,
        homeName: h.name,
        averageLagDays: 0,
        hasPayments: false,
      };
    }
    const sum = list.reduce((a, b) => a + b, 0);
    return {
      homeId: h.id,
      homeName: h.name,
      averageLagDays: Math.round((10 * sum) / list.length) / 10,
      hasPayments: true,
    };
  });
  mapped.sort((a, b) => {
    const d = b.averageLagDays - a.averageLagDays;
    if (d !== 0) {
      return d;
    }
    return a.homeName.localeCompare(b.homeName);
  });
  return mapped;
}

import { and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import {
  homes,
  residentMonthlyCharges,
  residentPayments,
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
      total: sql<number>`ifnull(sum(${residentMonthlyCharges.amountMinorSnapshot}), 0)`,
    })
    .from(residentMonthlyCharges)
    .where(eq(residentMonthlyCharges.billingMonth, billingMonth))
    .get();
  return Number(row?.total ?? 0);
}

export function sumCollectedForBillingMonth(
  db: AppDb,
  billingMonth: string,
): number {
  const row = db
    .select({
      total: sql<number>`ifnull(sum(${residentPayments.amountMinor}), 0)`,
    })
    .from(residentMonthlyCharges)
    .innerJoin(
      residentPayments,
      eq(
        residentPayments.residentMonthlyChargeId,
        residentMonthlyCharges.id,
      ),
    )
    .where(eq(residentMonthlyCharges.billingMonth, billingMonth))
    .get();
  return Number(row?.total ?? 0);
}

export function sumOutstandingUnpaidMinor(db: AppDb): number {
  const row = db
    .select({
      total: sql<number>`ifnull(sum(${residentMonthlyCharges.amountMinorSnapshot}), 0)`,
    })
    .from(residentMonthlyCharges)
    .leftJoin(
      residentPayments,
      eq(
        residentPayments.residentMonthlyChargeId,
        residentMonthlyCharges.id,
      ),
    )
    .where(isNull(residentPayments.id))
    .get();
  return Number(row?.total ?? 0);
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
      monthKey: residentMonthlyCharges.billingMonth,
      billedMinor: sql<number>`ifnull(sum(${residentMonthlyCharges.amountMinorSnapshot}), 0)`,
      collectedMinor: sql<number>`ifnull(sum(${residentPayments.amountMinor}), 0)`,
    })
    .from(residentMonthlyCharges)
    .leftJoin(
      residentPayments,
      eq(
        residentPayments.residentMonthlyChargeId,
        residentMonthlyCharges.id,
      ),
    )
    .where(
      and(
        gte(residentMonthlyCharges.billingMonth, startMonth),
        lte(residentMonthlyCharges.billingMonth, endMonth),
      ),
    )
    .groupBy(residentMonthlyCharges.billingMonth)
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

  const lags = db
    .select({
      homeId: residents.homeId,
      billingMonth: residentMonthlyCharges.billingMonth,
      paidOn: residentPayments.paidOn,
    })
    .from(residentPayments)
    .innerJoin(
      residentMonthlyCharges,
      eq(residentPayments.residentMonthlyChargeId, residentMonthlyCharges.id),
    )
    .innerJoin(residents, eq(residents.id, residentMonthlyCharges.residentId))
    .innerJoin(homes, eq(homes.id, residents.homeId))
    .where(isNull(homes.archivedAtUtcMs))
    .all();

  const byHome = new Map<string, number[]>();
  for (const row of lags) {
    const lag = paymentLagDaysFromMonthEnd(row.billingMonth, row.paidOn);
    const list = byHome.get(row.homeId) ?? [];
    list.push(lag);
    byHome.set(row.homeId, list);
  }

  const mapped = homeRows.map((h) => {
    const list = byHome.get(h.id);
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

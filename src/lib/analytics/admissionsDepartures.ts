import { and, count, eq, gte, like, lt } from "drizzle-orm";
import { residentDepartureDetails, residents } from "@/db/schema";
import { utcBillingMonthFromMs } from "@/lib/billing/billingMonth";
import type { AppDb } from "@/lib/homes/service";
import { shiftBillingMonth } from "@/lib/analytics/revenueCollections";

/** Inclusive start, exclusive end (ms) for the UTC calendar month `YYYY-MM`. */
export function utcMonthRangeExclusiveEnd(monthKey: string): {
  startMs: number;
  endExclusiveMs: number;
} {
  const [y, m] = monthKey.split("-").map(Number);
  const startMs = Date.UTC(y, m - 1, 1);
  const endExclusiveMs = Date.UTC(y, m, 1);
  return { startMs, endExclusiveMs };
}

export function stayDaysBetweenAdmissionAndDeparture(
  admissionDate: string,
  departedAtUtcMs: number,
): number {
  const [y, m, d] = admissionDate.split("-").map(Number);
  const admitDay = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  const departDay = Math.floor(departedAtUtcMs / 86_400_000);
  return Math.max(0, departDay - admitDay);
}

function medianOfSorted(sorted: number[]): number | null {
  if (sorted.length === 0) {
    return null;
  }
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Readable label from a day count (30-day buckets for month part). */
export function formatStayDurationFromDays(days: number): string {
  const d = Math.max(0, Math.round(days));
  if (d === 0) {
    return "0 days";
  }
  const months = Math.floor(d / 30);
  const rem = d % 30;
  if (months === 0) {
    return `${rem} day${rem === 1 ? "" : "s"}`;
  }
  if (rem === 0) {
    return `${months} month${months === 1 ? "" : "s"}`;
  }
  return `${months} month${months === 1 ? "" : "s"} ${rem} day${rem === 1 ? "" : "s"}`;
}

export function countAdmissionsInMonth(db: AppDb, monthKey: string): number {
  const row = db
    .select({ c: count() })
    .from(residents)
    .where(like(residents.admissionDate, `${monthKey}-%`))
    .get();
  return Number(row?.c ?? 0);
}

export function countDeparturesInMonth(db: AppDb, monthKey: string): number {
  const { startMs, endExclusiveMs } = utcMonthRangeExclusiveEnd(monthKey);
  const row = db
    .select({ c: count() })
    .from(residentDepartureDetails)
    .where(
      and(
        gte(residentDepartureDetails.departedAtUtcMs, startMs),
        lt(residentDepartureDetails.departedAtUtcMs, endExclusiveMs),
      ),
    )
    .get();
  return Number(row?.c ?? 0);
}

export type AdmissionsDeparturesKpis = {
  monthCurrent: string;
  admissionsThisMonth: number;
  admissionsPrevMonth: number;
  admissionsMomDelta: number;
  admissionsMomDeltaPercent: number | null;
  departuresThisMonth: number;
  departuresPrevMonth: number;
  departuresMomDelta: number;
  departuresMomDeltaPercent: number | null;
  /** Median stay days for all departed residents; null when none. */
  avgLengthOfStayMedianDays: number | null;
};

export function getAdmissionsDeparturesKpis(
  db: AppDb,
  atUtcMs: number,
): AdmissionsDeparturesKpis {
  const monthCurrent = utcBillingMonthFromMs(atUtcMs);
  const prev = shiftBillingMonth(monthCurrent, -1);
  const admissionsThisMonth = countAdmissionsInMonth(db, monthCurrent);
  const admissionsPrevMonth = countAdmissionsInMonth(db, prev);
  const admissionsMomDelta = admissionsThisMonth - admissionsPrevMonth;
  const admissionsMomDeltaPercent =
    admissionsPrevMonth > 0
      ? Math.round((100 * admissionsMomDelta) / admissionsPrevMonth)
      : null;

  const departuresThisMonth = countDeparturesInMonth(db, monthCurrent);
  const departuresPrevMonth = countDeparturesInMonth(db, prev);
  const departuresMomDelta = departuresThisMonth - departuresPrevMonth;
  const departuresMomDeltaPercent =
    departuresPrevMonth > 0
      ? Math.round((100 * departuresMomDelta) / departuresPrevMonth)
      : null;

  const stayDays = listStayDaysForAllDeparted(db);
  const sorted = [...stayDays].sort((a, b) => a - b);
  const median = medianOfSorted(sorted);

  return {
    monthCurrent,
    admissionsThisMonth,
    admissionsPrevMonth,
    admissionsMomDelta,
    admissionsMomDeltaPercent,
    departuresThisMonth,
    departuresPrevMonth,
    departuresMomDelta,
    departuresMomDeltaPercent,
    avgLengthOfStayMedianDays: median,
  };
}

function listStayDaysForAllDeparted(db: AppDb): number[] {
  const rows = db
    .select({
      admissionDate: residents.admissionDate,
      departedAtUtcMs: residentDepartureDetails.departedAtUtcMs,
    })
    .from(residentDepartureDetails)
    .innerJoin(
      residents,
      eq(residents.id, residentDepartureDetails.residentId),
    )
    .all();
  return rows.map((r) =>
    stayDaysBetweenAdmissionAndDeparture(
      r.admissionDate,
      r.departedAtUtcMs,
    ),
  );
}

export type AdmissionsDeparturesMonthDatum = {
  monthKey: string;
  monthLabelShort: string;
  admissions: number;
  departures: number;
};

const shortMonthUtc = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
});

function shortMonthLabelFromKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return shortMonthUtc.format(new Date(Date.UTC(y, m - 1, 1)));
}

/** Rolling 12 UTC months ending at the month of `atUtcMs`; zero-filled. */
export function listTwelveMonthAdmissionsDepartures(
  db: AppDb,
  atUtcMs: number,
): AdmissionsDeparturesMonthDatum[] {
  const endMonth = utcBillingMonthFromMs(atUtcMs);
  const startMonth = shiftBillingMonth(endMonth, -11);
  const out: AdmissionsDeparturesMonthDatum[] = [];
  let cursor = startMonth;
  while (cursor <= endMonth) {
    out.push({
      monthKey: cursor,
      monthLabelShort: shortMonthLabelFromKey(cursor),
      admissions: countAdmissionsInMonth(db, cursor),
      departures: countDeparturesInMonth(db, cursor),
    });
    cursor = shiftBillingMonth(cursor, 1);
  }
  return out;
}

import { ValidationError } from "@/lib/homes/errors";

const MAX_LEDGER_POSTED_RANGE_DAYS = 366 * 3 + 1;

/** Current UTC calendar date as `YYYY-MM-DD`. */
export function utcPostedDateFromMs(atUtcMs: number): string {
  const d = new Date(atUtcMs);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Jan 1 through today (UTC calendar days) for the year of `atUtcMs`. */
export function utcYearToDatePostedDateRange(atUtcMs: number): {
  postedFrom: string;
  postedTo: string;
} {
  const postedTo = utcPostedDateFromMs(atUtcMs);
  const y = postedTo.slice(0, 4);
  return { postedFrom: `${y}-01-01`, postedTo };
}

function utcMsStartOfDayYmd(ymd: string): number {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7)) - 1;
  const d = Number(ymd.slice(8, 10));
  return Date.UTC(y, m, d, 0, 0, 0, 0);
}

function utcMsEndOfDayYmd(ymd: string): number {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7)) - 1;
  const d = Number(ymd.slice(8, 10));
  return Date.UTC(y, m, d, 23, 59, 59, 999);
}

export function parsePostedDate(raw: string): string {
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new ValidationError("posted date must be YYYY-MM-DD (UTC).");
  }
  const y = Number(s.slice(0, 4));
  const mo = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (!Number.isInteger(y) || mo < 1 || mo > 12 || d < 1 || d > 31) {
    throw new ValidationError("posted date is not a valid UTC calendar day.");
  }
  const ms = Date.UTC(y, mo - 1, d);
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== mo - 1 ||
    check.getUTCDate() !== d
  ) {
    throw new ValidationError("posted date is not a valid UTC calendar day.");
  }
  return s;
}

function inclusiveDaySpan(from: string, to: string): number {
  const a = utcMsStartOfDayYmd(from);
  const b = utcMsStartOfDayYmd(to);
  return Math.floor((b - a) / (24 * 60 * 60 * 1000)) + 1;
}

/**
 * Resolves the posted-date window for `/dashboard/ledger`.
 * If either query param is missing, invalid, out of order, or spans too many
 * days, returns UTC calendar year-to-date (Jan 1 → today at `atUtcMs`).
 */
export function resolvePostedLedgerDateRange(
  fromRaw: string | undefined,
  toRaw: string | undefined,
  atUtcMs: number,
): { postedFrom: string; postedTo: string } {
  const ytd = utcYearToDatePostedDateRange(atUtcMs);
  const fromS =
    fromRaw == null || typeof fromRaw !== "string" ? "" : fromRaw.trim();
  const toS = toRaw == null || typeof toRaw !== "string" ? "" : toRaw.trim();
  if (!fromS || !toS) {
    return ytd;
  }
  try {
    const postedFrom = parsePostedDate(fromS);
    const postedTo = parsePostedDate(toS);
    if (postedFrom > postedTo) {
      return ytd;
    }
    if (inclusiveDaySpan(postedFrom, postedTo) > MAX_LEDGER_POSTED_RANGE_DAYS) {
      return ytd;
    }
    return { postedFrom, postedTo };
  } catch {
    return ytd;
  }
}

export function postedMsWithinRangeInclusive(
  postedAtUtcMs: number,
  postedFrom: string,
  postedTo: string,
): boolean {
  const lo = utcMsStartOfDayYmd(postedFrom);
  const hi = utcMsEndOfDayYmd(postedTo);
  return postedAtUtcMs >= lo && postedAtUtcMs <= hi;
}

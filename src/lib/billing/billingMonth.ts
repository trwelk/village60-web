import { ValidationError } from "@/lib/homes/errors";

/** `YYYY-MM` for the UTC calendar month containing `atUtcMs`. */
export function utcBillingMonthFromMs(atUtcMs: number): string {
  const d = new Date(atUtcMs);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

/** Calendar year-to-date in UTC billing months: January of that year through the month of `atUtcMs`. */
export function utcYearToDateBillingMonthRange(atUtcMs: number): {
  billingMonthFrom: string;
  billingMonthTo: string;
} {
  const billingMonthTo = utcBillingMonthFromMs(atUtcMs);
  const y = billingMonthTo.slice(0, 4);
  return { billingMonthFrom: `${y}-01`, billingMonthTo };
}

/** Validates and normalizes `billingMonth` (UTC month label, no TZ conversion). */
export function parseBillingMonth(raw: string): string {
  const s = raw.trim();
  if (!/^\d{4}-\d{2}$/.test(s)) {
    throw new ValidationError("billingMonth must be YYYY-MM (UTC).");
  }
  const [yStr, mStr] = s.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (m < 1 || m > 12 || !Number.isInteger(y)) {
    throw new ValidationError("billingMonth is not a valid UTC calendar month.");
  }
  return s;
}

const MAX_LEDG_BILLING_MONTHS_IN_RANGE = 36;

function monthsInclusiveInBillingRange(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return ty * 12 + tm - (fy * 12 + fm) + 1;
}

/**
 * Resolves the billing-month window for `/dashboard/charges`.
 * If either query param is missing, invalid, out of order, or spans too many
 * months, returns UTC calendar YTD (January → current month at `atUtcMs`).
 */
export function resolveLedgerBillingMonthRange(
  fromRaw: string | undefined,
  toRaw: string | undefined,
  atUtcMs: number,
): { billingMonthFrom: string; billingMonthTo: string } {
  const ytd = utcYearToDateBillingMonthRange(atUtcMs);
  const fromS =
    fromRaw == null || typeof fromRaw !== "string" ? "" : fromRaw.trim();
  const toS = toRaw == null || typeof toRaw !== "string" ? "" : toRaw.trim();
  if (!fromS || !toS) {
    return ytd;
  }
  try {
    const billingMonthFrom = parseBillingMonth(fromS);
    const billingMonthTo = parseBillingMonth(toS);
    if (billingMonthFrom > billingMonthTo) {
      return ytd;
    }
    if (monthsInclusiveInBillingRange(billingMonthFrom, billingMonthTo) > MAX_LEDG_BILLING_MONTHS_IN_RANGE) {
      return ytd;
    }
    return { billingMonthFrom, billingMonthTo };
  } catch {
    return ytd;
  }
}

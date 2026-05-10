import { ValidationError } from "@/lib/homes/errors";

/** Midnight UTC for calendar date `YYYY-MM-DD` (no local timezone drift). */
export function calendarDateIsoToUtcMs(isoCalendarDate: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoCalendarDate.trim())) {
    throw new ValidationError("receivedOn must be YYYY-MM-DD.");
  }
  const trimmed = isoCalendarDate.trim();
  const [ys, ms, ds] = trimmed.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  return Date.UTC(y, m - 1, d, 0, 0, 0, 0);
}

/** `YYYY-MM-DD` in UTC for a stored UTC-ms receipt instant. */
export function utcCalendarDateIsoFromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** JSON accepts UTC milliseconds or legacy `YYYY-MM-DD` calendar string. */
export function parseBillingPaymentReceivedOnUtcMs(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const t = Math.trunc(raw);
    if (
      !Number.isInteger(t) ||
      t <= 0 ||
      t > Number.MAX_SAFE_INTEGER
    ) {
      throw new ValidationError("receivedOn must be a valid UTC millisecond timestamp.");
    }
    return t;
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    return calendarDateIsoToUtcMs(raw);
  }
  throw new ValidationError("receivedOn is required.");
}

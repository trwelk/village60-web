import type { HomeMonthlyChargesLedgerPaymentStatusFilter } from "./residentCharges";
import {
  DEFAULT_CHARGES_LEDGER_PAGE_SIZE,
  MAX_CHARGES_LEDGER_PAGE_SIZE,
} from "./residentCharges";

type ChargesPathOpts = {
  page?: number;
  pageSize?: number;
  paymentStatus?: HomeMonthlyChargesLedgerPaymentStatusFilter;
};

/**
 * Build `/dashboard/charges` with query string. When the range matches
 * current calendar YTD, `billingMonthFrom` / `billingMonthTo` are omitted.
 * Pagination and payment status omit defaults (page 1, default page size, all).
 */
export function buildDashboardChargesPath(
  homeId: string,
  from: string,
  to: string,
  ytdFrom: string,
  ytdTo: string,
  opts?: ChargesPathOpts,
): string {
  const p = new URLSearchParams();
  p.set("homeId", homeId);
  if (from !== ytdFrom || to !== ytdTo) {
    p.set("billingMonthFrom", from);
    p.set("billingMonthTo", to);
  }
  const page = Math.max(1, opts?.page ?? 1);
  const rawSize = opts?.pageSize ?? DEFAULT_CHARGES_LEDGER_PAGE_SIZE;
  const pageSize = Math.min(
    MAX_CHARGES_LEDGER_PAGE_SIZE,
    Math.max(1, rawSize),
  );
  const paymentStatus = opts?.paymentStatus ?? "all";
  if (page > 1) {
    p.set("page", String(page));
  }
  if (pageSize !== DEFAULT_CHARGES_LEDGER_PAGE_SIZE) {
    p.set("pageSize", String(pageSize));
  }
  if (paymentStatus !== "all") {
    p.set("paymentStatus", paymentStatus);
  }
  return `/dashboard/charges?${p.toString()}`;
}

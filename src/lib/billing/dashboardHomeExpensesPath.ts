import type { HomeOperatingInvoiceLedgerPaymentStatusFilter } from "@/lib/billing/homeOperatingInvoiceLedger";
import {
  DEFAULT_HOME_OPERATING_INVOICES_PAGE_SIZE,
  MAX_HOME_OPERATING_INVOICES_PAGE_SIZE,
} from "@/lib/billing/homeOperatingInvoiceLedger";

type HomeExpensesPathOpts = {
  page?: number;
  pageSize?: number;
  paymentStatus?: HomeOperatingInvoiceLedgerPaymentStatusFilter;
};

/**
 * Build `/dashboard/home-expenses` with query string. When the range matches
 * current calendar YTD, `billingMonthFrom` / `billingMonthTo` are omitted.
 */
export function buildDashboardHomeExpensesPath(
  homeId: string,
  from: string,
  to: string,
  ytdFrom: string,
  ytdTo: string,
  opts?: HomeExpensesPathOpts,
): string {
  const p = new URLSearchParams();
  p.set("homeId", homeId);
  if (from !== ytdFrom || to !== ytdTo) {
    p.set("billingMonthFrom", from);
    p.set("billingMonthTo", to);
  }
  const page = Math.max(1, opts?.page ?? 1);
  const rawSize = opts?.pageSize ?? DEFAULT_HOME_OPERATING_INVOICES_PAGE_SIZE;
  const pageSize = Math.min(
    MAX_HOME_OPERATING_INVOICES_PAGE_SIZE,
    Math.max(1, rawSize),
  );
  const paymentStatus = opts?.paymentStatus ?? "all";
  if (page > 1) {
    p.set("page", String(page));
  }
  if (pageSize !== DEFAULT_HOME_OPERATING_INVOICES_PAGE_SIZE) {
    p.set("pageSize", String(pageSize));
  }
  if (paymentStatus !== "all") {
    p.set("paymentStatus", paymentStatus);
  }
  return `/dashboard/home-expenses?${p.toString()}`;
}

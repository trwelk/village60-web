import { MAX_CHARGES_LEDGER_PAGE_SIZE } from "@/lib/billing/residentCharges";
import {
  DEFAULT_HOME_EXPENSES_LEDGER_PAGE_SIZE,
  type HomeExpensesLedgerPaymentFilter,
} from "@/lib/homeExpenses/ledgerShared";

/**
 * Builds `/dashboard/expenses` URL with `homeId`, optional incurred range,
 * payment filter, type filter, and pagination (omit at defaults).
 */
export function buildDashboardExpensesPath(
  homeId: string,
  options: {
    incurredFrom?: string;
    incurredTo?: string;
    paymentStatus?: HomeExpensesLedgerPaymentFilter;
    expenseTypeId?: string;
    page?: number;
    pageSize?: number;
  } = {},
): string {
  const p = new URLSearchParams();
  p.set("homeId", homeId);
  const { incurredFrom = "", incurredTo = "" } = options;
  if (incurredFrom.trim() || incurredTo.trim()) {
    if (incurredFrom.trim()) p.set("incurredFrom", incurredFrom.trim());
    if (incurredTo.trim()) p.set("incurredTo", incurredTo.trim());
  }
  const pay = options.paymentStatus ?? "all";
  if (pay !== "all") {
    p.set("paymentStatus", pay);
  }
  const typeId = options.expenseTypeId?.trim() ?? "";
  if (typeId) {
    p.set("expenseTypeId", typeId);
  }
  const page = Math.max(1, Math.floor(options.page ?? 1) || 1);
  const defaultSize = DEFAULT_HOME_EXPENSES_LEDGER_PAGE_SIZE;
  const rawSize =
    options.pageSize === undefined
      ? defaultSize
      : Math.floor(options.pageSize) || defaultSize;
  const pageSize = Math.min(
    MAX_CHARGES_LEDGER_PAGE_SIZE,
    Math.max(1, rawSize),
  );
  if (page > 1) {
    p.set("page", String(page));
  }
  if (pageSize !== defaultSize) {
    p.set("pageSize", String(pageSize));
  }
  return `/dashboard/expenses?${p.toString()}`;
}

/**
 * Detail URL for one ledger row; repeats the same query string as
 * {@link buildDashboardExpensesPath} so “Back to ledger” can restore filters.
 */
export function buildDashboardExpenseDetailPath(
  homeId: string,
  expenseId: string,
  options: Parameters<typeof buildDashboardExpensesPath>[1] = {},
): string {
  const listPath = buildDashboardExpensesPath(homeId, options);
  const qs = listPath.includes("?")
    ? listPath.slice(listPath.indexOf("?"))
    : "";
  return `/dashboard/expenses/${encodeURIComponent(homeId)}/${encodeURIComponent(expenseId)}${qs}`;
}

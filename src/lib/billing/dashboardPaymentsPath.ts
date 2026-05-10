import {
  DEFAULT_PAYMENTS_LEDGER_PAGE_SIZE,
  MAX_PAYMENTS_LEDGER_PAGE_SIZE,
} from "@/lib/billing/residentCharges";

export type DashboardPaymentsAccountType = "resident" | "home";

export type BuildDashboardPaymentsPathOptions = {
  accountType?: DashboardPaymentsAccountType;
  residentId?: string | null;
};

/**
 * Build `/dashboard/payments` with `homeId`, `accountType`, optional resident
 * filter (resident accounts only), and optional pagination query params.
 * Omits `page` and `pageSize` when they match defaults (page 1, default size).
 */
export function buildDashboardPaymentsPath(
  homeId: string,
  page: number,
  pageSize: number,
  options?: BuildDashboardPaymentsPathOptions,
): string {
  const p = new URLSearchParams();
  p.set("homeId", homeId);
  const accountType = options?.accountType ?? "resident";
  p.set("accountType", accountType);
  if (accountType === "resident") {
    const resident = options?.residentId?.trim() ?? "";
    if (resident !== "") {
      p.set("residentId", resident);
    }
  }
  const safePage = Math.max(1, page);
  const safeSize = Math.min(
    MAX_PAYMENTS_LEDGER_PAGE_SIZE,
    Math.max(1, pageSize),
  );
  if (safePage > 1) {
    p.set("page", String(safePage));
  }
  if (safeSize !== DEFAULT_PAYMENTS_LEDGER_PAGE_SIZE) {
    p.set("pageSize", String(safeSize));
  }
  return `/dashboard/payments?${p.toString()}`;
}

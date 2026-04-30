import {
  DEFAULT_CHARGES_LEDGER_PAGE_SIZE,
  MAX_CHARGES_LEDGER_PAGE_SIZE,
  type HomeOtherChargesReceivedFilter,
} from "./residentCharges";

/**
 * Build `/dashboard/other-charges` with `homeId` and optional `residentId` and
 * `status` (all / unpaid / paid) and optional pagination. Omits optional params
 * at defaults (page 1, default page size), aligned with 20a / 22a.
 */
export function buildDashboardOtherChargesPath(
  homeId: string,
  residentId: string,
  status: HomeOtherChargesReceivedFilter,
  page: number = 1,
  pageSize: number = DEFAULT_CHARGES_LEDGER_PAGE_SIZE,
): string {
  const p = new URLSearchParams();
  p.set("homeId", homeId);
  if (residentId.trim()) {
    p.set("residentId", residentId.trim());
  }
  if (status !== "all") {
    p.set("status", status);
  }
  const safePage = Math.max(1, page);
  const safeSize = Math.min(
    MAX_CHARGES_LEDGER_PAGE_SIZE,
    Math.max(1, pageSize),
  );
  if (safePage > 1) {
    p.set("page", String(safePage));
  }
  if (safeSize !== DEFAULT_CHARGES_LEDGER_PAGE_SIZE) {
    p.set("pageSize", String(safeSize));
  }
  return `/dashboard/other-charges?${p.toString()}`;
}

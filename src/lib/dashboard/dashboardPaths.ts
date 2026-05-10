/** Shared path predicates for primary nav and hub titles (kept in sync with 23a/23c). */

export function isDashboardResidentsPath(pathname: string): boolean {
  if (pathname === "/dashboard/residents") return true;
  return /\/dashboard\/homes\/[^/]+\/residents(\/|$)/.test(pathname);
}

export function isDashboardHomesPath(pathname: string): boolean {
  if (!pathname.startsWith("/dashboard/homes")) return false;
  return !/\/dashboard\/homes\/[^/]+\/residents(\/|$)/.test(pathname);
}

export function isDashboardUsersPath(pathname: string): boolean {
  return pathname.startsWith("/dashboard/users");
}

export function isDashboardLeadsPath(pathname: string): boolean {
  return pathname.startsWith("/dashboard/leads");
}

export function isDashboardChargesPath(pathname: string): boolean {
  return pathname === "/dashboard/charges";
}

export function isDashboardHomeExpensesPath(pathname: string): boolean {
  return pathname === "/dashboard/home-expenses";
}

export function isDashboardHomeAccountPaymentsPath(pathname: string): boolean {
  return pathname === "/dashboard/home-payments";
}

export function isDashboardPaymentsPath(pathname: string): boolean {
  return pathname === "/dashboard/payments";
}

export function isDashboardLedgerPath(pathname: string): boolean {
  return (
    pathname === "/dashboard/ledger" ||
    /\/dashboard\/homes\/[^/]+\/ledger$/.test(pathname)
  );
}

export function isDashboardInvoicesPath(pathname: string): boolean {
  return (
    pathname === "/dashboard/invoices" ||
    /^\/dashboard\/invoices\/[^/]+$/.test(pathname)
  );
}

export function isDashboardTasksPath(pathname: string): boolean {
  return pathname === "/dashboard/tasks";
}

/** Sibling hub segments under `/dashboard/inventory-orders/*`, not PO ids. */
const INVENTORY_ORDERS_NON_PO_SEGMENTS = new Set(["catalog", "suppliers"]);

export function isDashboardInventoryOrdersPath(pathname: string): boolean {
  if (pathname === "/dashboard/inventory-orders") return true;
  const m = /^\/dashboard\/inventory-orders\/([^/]+)$/.exec(pathname);
  if (!m) return false;
  if (INVENTORY_ORDERS_NON_PO_SEGMENTS.has(m[1]!)) return false;
  return true;
}

export function isDashboardInventoryCatalogPath(pathname: string): boolean {
  return pathname === "/dashboard/inventory-orders/catalog";
}

export function isDashboardInventorySuppliersPath(pathname: string): boolean {
  return pathname === "/dashboard/inventory-orders/suppliers";
}

export function isDashboardAccountPath(pathname: string): boolean {
  return pathname === "/dashboard/account";
}

export function isDashboardAdminSettingsPath(pathname: string): boolean {
  return pathname.startsWith("/dashboard/admin/settings");
}

export function isDashboardAnalyticsPath(pathname: string): boolean {
  return (
    pathname === "/dashboard/analytics" ||
    pathname.startsWith("/dashboard/analytics/")
  );
}

export function isDashboardAnalyticsRevenueCollectionsPath(
  pathname: string,
): boolean {
  return (
    pathname === "/dashboard/analytics/revenue-collections" ||
    pathname === "/dashboard/analytics"
  );
}

export function isDashboardAnalyticsAdmissionsDeparturesPath(
  pathname: string,
): boolean {
  return pathname === "/dashboard/analytics/admissions-departures";
}

export function isDashboardAnalyticsDemographicsStaffPath(
  pathname: string,
): boolean {
  return pathname === "/dashboard/analytics/demographics-staff";
}

export function isDashboardAnalyticsOccupancyPath(
  pathname: string,
): boolean {
  return pathname === "/dashboard/analytics/occupancy";
}

export function isDashboardAnalyticsFinancialPath(pathname: string): boolean {
  return pathname === "/dashboard/analytics/financial";
}

/**
 * Per-resident record under a home (not the directory list, not `new` or `departed`).
 * Used to defer breadcrumbs to a nested layout (23c).
 */
export function isHomeResidentDetailPath(pathname: string): boolean {
  return /\/dashboard\/homes\/[^/]+\/residents\/(?!new$|departed$)([^/]+)$/.test(
    pathname,
  );
}

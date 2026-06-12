/** Shared path predicates for primary nav and hub titles (kept in sync with 23a/23c). */

export function isDashboardResidentsPath(pathname: string): boolean {
  if (pathname === "/dashboard/residents") return true;
  if (pathname.startsWith("/dashboard/residents/")) return true;
  return /\/dashboard\/homes\/[^/]+\/residents(\/|$)/.test(pathname);
}

export function isDashboardHomesPath(pathname: string): boolean {
  if (!pathname.startsWith("/dashboard/homes")) return false;
  return !/\/dashboard\/homes\/[^/]+\/residents(\/|$)/.test(pathname);
}

export function isDashboardUsersPath(pathname: string): boolean {
  return pathname.startsWith("/dashboard/users");
}

export function isDashboardWaitingListPath(pathname: string): boolean {
  return pathname.startsWith("/dashboard/waiting-list");
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
  return (
    pathname === "/dashboard/analytics/financial" ||
    pathname === "/dashboard/analytics"
  );
}

export function isDashboardMarPath(pathname: string): boolean {
  return (
    pathname === "/dashboard/mar" ||
    /\/dashboard\/homes\/[^/]+\/mar(\/|$)/.test(pathname)
  );
}

export function isDashboardWardsPath(pathname: string): boolean {
  return (
    pathname === "/dashboard/wards" ||
    /\/dashboard\/homes\/[^/]+\/wards$/.test(pathname)
  );
}

export function isDashboardDepartedResidentsPath(pathname: string): boolean {
  return (
    pathname === "/dashboard/residents/departed" ||
    /\/dashboard\/homes\/[^/]+\/residents\/departed$/.test(pathname)
  );
}

export function isDashboardMedicationReordersPath(pathname: string): boolean {
  return pathname === "/dashboard/medication-reorders";
}

export function isDashboardMedicationsPath(pathname: string): boolean {
  return (
    pathname === "/dashboard/medications" ||
    /^\/dashboard\/residents\/([^/]+)\/medications$/.test(pathname) ||
    /\/dashboard\/homes\/[^/]+\/residents\/[^/]+\/medications$/.test(pathname)
  );
}

/** @deprecated Use isDashboardMedicationsPath */
export const isDashboardResidentMedicationsPath = isDashboardMedicationsPath;

/** Home id from `/dashboard/homes/[id]/*`; null on the homes hub list. */
export function extractDashboardHomeIdFromPathname(
  pathname: string,
): string | null {
  const m = /^\/dashboard\/homes\/([^/]+)/.exec(pathname);
  return m?.[1] ?? null;
}

/** Resident id from flat `/dashboard/residents/[residentId]` routes. */
export function extractDashboardResidentIdFromPathname(
  pathname: string,
): string | null {
  const detail = /^\/dashboard\/residents\/([^/]+)$/.exec(pathname);
  if (detail && detail[1] !== "new" && detail[1] !== "departed") {
    return detail[1]!;
  }
  const medications =
    /^\/dashboard\/residents\/([^/]+)\/medications$/.exec(pathname);
  return medications?.[1] ?? null;
}

/** Per-resident record (flat or legacy nested), excluding list/new/departed/medications-only. */
export function isHomeResidentDetailPath(pathname: string): boolean {
  if (
    /^\/dashboard\/residents\/(?!new$|departed$)([^/]+)$/.test(pathname)
  ) {
    return true;
  }
  return /\/dashboard\/homes\/[^/]+\/residents\/(?!new$|departed$)([^/]+)$/.test(
    pathname,
  );
}

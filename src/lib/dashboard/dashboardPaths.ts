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

export function isDashboardOtherChargesPath(pathname: string): boolean {
  return pathname === "/dashboard/other-charges";
}

export function isDashboardPaymentsPath(pathname: string): boolean {
  return pathname === "/dashboard/payments";
}

export function isDashboardExpenseTypesPath(pathname: string): boolean {
  return pathname === "/dashboard/expenses/types";
}

export function isDashboardExpensesPath(pathname: string): boolean {
  return pathname === "/dashboard/expenses";
}

export function isDashboardTasksPath(pathname: string): boolean {
  return pathname === "/dashboard/tasks";
}

export function isDashboardMedicationsPath(pathname: string): boolean {
  return pathname === "/dashboard/medications";
}

/** Per-home medication orders hub (**34b**). */
export function isDashboardHomeMedicationOrdersPath(pathname: string): boolean {
  return /\/dashboard\/homes\/[^/]+\/medications\/orders$/.test(pathname);
}

/** Per-home low-stock operational view (**34d**). */
export function isDashboardHomeMedicationLowStockPath(pathname: string): boolean {
  return /\/dashboard\/homes\/[^/]+\/medications\/low-stock$/.test(pathname);
}

export function isDashboardResidentMedicationsPath(pathname: string): boolean {
  return pathname === "/dashboard/resident-medications";
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

/**
 * Per-resident record under a home (not the directory list, not `new` or `departed`).
 * Used to defer breadcrumbs to a nested layout (23c).
 */
export function isHomeResidentDetailPath(pathname: string): boolean {
  return /\/dashboard\/homes\/[^/]+\/residents\/(?!new$|departed$)([^/]+)$/.test(
    pathname,
  );
}

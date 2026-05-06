import type { SessionUserRole } from "@/lib/session";

import {

  isDashboardAccountPath,

  isDashboardAnalyticsPath,

  isDashboardChargesPath,

  isDashboardExpenseTypesPath,

  isDashboardExpensesPath,

  isDashboardHomesPath,

  isDashboardLeadsPath,

  isDashboardOtherChargesPath,

  isDashboardPaymentsPath,

  isDashboardResidentsPath,

  isDashboardTasksPath,

  isDashboardMedicationsPath,

  isDashboardHomeMedicationOrdersPath,

  isDashboardHomeMedicationLowStockPath,

  isDashboardResidentMedicationsPath,

  isDashboardUsersPath,

  isDashboardAdminSettingsPath,

} from "./dashboardPaths";



/**

 * Short static wayfinding label for the dashboard top bar when there is no

 * nested `DashboardWayfinding` trail (e.g. hub routes). For routes under

 * `homes/[id]`, server layouts register breadcrumbs; this map still provides

 * the same “active hub” labels as the primary nav for the fallback and for

 * paths without registration.

 */

export function getDashboardContextTitle(

  pathname: string,

  role: SessionUserRole,

): string {

  if (pathname === "/dashboard") return "Overview";

  if (isDashboardAnalyticsPath(pathname)) return "Analytics";

  if (isDashboardAccountPath(pathname)) return "My account";

  if (isDashboardResidentsPath(pathname)) return "Residents";

  if (isDashboardTasksPath(pathname)) return "Tasks";

  if (isDashboardMedicationsPath(pathname)) return "Medications";

  if (isDashboardHomeMedicationOrdersPath(pathname)) return "Medication orders";

  if (isDashboardHomeMedicationLowStockPath(pathname)) return "Low stock";

  if (isDashboardResidentMedicationsPath(pathname)) return "Resident medications";

  if (isDashboardHomesPath(pathname)) {

    return role === "admin" ? "Retirement homes" : "Your homes";

  }

  if (isDashboardChargesPath(pathname)) return "Charges";

  if (isDashboardOtherChargesPath(pathname)) return "Other charges";

  if (isDashboardPaymentsPath(pathname)) return "Payments";

  if (isDashboardExpensesPath(pathname)) return "Home expenses";

  if (isDashboardExpenseTypesPath(pathname)) return "Expense types";

  if (isDashboardUsersPath(pathname)) return "Staff";

  if (isDashboardAdminSettingsPath(pathname)) return "Admin settings";

  if (isDashboardLeadsPath(pathname)) return "Leads";

  return "Dashboard";

}


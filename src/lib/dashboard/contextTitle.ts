import type { SessionUserRole } from "@/lib/session";

import {

  isDashboardAccountPath,

  isDashboardAnalyticsPath,

  isDashboardChargesPath,
  isDashboardHomeExpensesPath,

  isDashboardHomesPath,

  isDashboardInvoicesPath,

  isDashboardWaitingListPath,

  isDashboardLedgerPath,

  isDashboardPaymentsPath,
  isDashboardHomeAccountPaymentsPath,

  isDashboardResidentsPath,

  isDashboardTasksPath,
  isDashboardInventoryCatalogPath,
  isDashboardInventoryOrdersPath,
  isDashboardInventorySuppliersPath,
  isDashboardMarPath,

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

  if (isDashboardMarPath(pathname)) return "Daily MAR";

  if (isDashboardTasksPath(pathname)) return "Tasks";
  if (isDashboardInventoryCatalogPath(pathname)) return "Inventory catalog";
  if (isDashboardInventorySuppliersPath(pathname)) return "Inventory suppliers";
  if (isDashboardInventoryOrdersPath(pathname)) return "Inventory orders";

  if (isDashboardInvoicesPath(pathname)) return "Invoices";

  if (isDashboardHomesPath(pathname)) {

    return role === "admin" ? "Retirement homes" : "Your homes";

  }

  if (isDashboardChargesPath(pathname)) return "Charges";

  if (isDashboardHomeExpensesPath(pathname)) return "Home expenses";

  if (isDashboardPaymentsPath(pathname)) return "Payments";

  if (isDashboardHomeAccountPaymentsPath(pathname)) return "Home payments";

  if (isDashboardLedgerPath(pathname)) return "Ledger";

  if (isDashboardUsersPath(pathname)) return "Staff";

  if (isDashboardAdminSettingsPath(pathname)) return "Admin settings";

  if (isDashboardWaitingListPath(pathname)) return "Waiting list";

  return "Dashboard";

}


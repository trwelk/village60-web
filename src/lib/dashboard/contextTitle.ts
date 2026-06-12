import type { TranslateFn } from "@/lib/i18n/messages";
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
  isDashboardMedicationsPath,
  isDashboardWardsPath,
  isDashboardUsersPath,
  isDashboardAdminSettingsPath,
} from "./dashboardPaths";

/**
 * Short static wayfinding label for the dashboard top bar when there is no
 * nested `DashboardWayfinding` trail (e.g. hub routes).
 */
export function getDashboardContextTitle(
  pathname: string,
  role: SessionUserRole,
  t: TranslateFn,
): string {
  if (pathname === "/dashboard") return t("nav.overview");
  if (isDashboardAnalyticsPath(pathname)) return t("nav.analytics");
  if (isDashboardAccountPath(pathname)) return t("nav.myAccount");
  if (isDashboardResidentsPath(pathname)) return t("nav.residents");
  if (isDashboardMedicationsPath(pathname)) return t("nav.medications");
  if (isDashboardMarPath(pathname)) return t("nav.dailyMar");
  if (isDashboardWardsPath(pathname)) return t("nav.wards");
  if (isDashboardTasksPath(pathname)) return t("nav.tasks");
  if (isDashboardInventoryCatalogPath(pathname)) return t("nav.inventoryCatalog");
  if (isDashboardInventorySuppliersPath(pathname)) return t("nav.suppliers");
  if (isDashboardInventoryOrdersPath(pathname)) return t("nav.inventoryOrders");
  if (isDashboardInvoicesPath(pathname)) return t("nav.invoices");
  if (isDashboardHomesPath(pathname)) {
    return role === "admin" ? t("nav.retirementHomes") : t("nav.yourHomes");
  }
  if (isDashboardChargesPath(pathname)) return t("nav.charges");
  if (isDashboardHomeExpensesPath(pathname)) return t("nav.homeExpenses");
  if (isDashboardPaymentsPath(pathname)) return t("nav.payments");
  if (isDashboardHomeAccountPaymentsPath(pathname)) return t("nav.homePayments");
  if (isDashboardLedgerPath(pathname)) return t("nav.ledger");
  if (isDashboardUsersPath(pathname)) return t("nav.staff");
  if (isDashboardAdminSettingsPath(pathname)) return t("nav.adminSettings");
  if (isDashboardWaitingListPath(pathname)) return t("nav.waitingList");
  return t("nav.dashboard");
}

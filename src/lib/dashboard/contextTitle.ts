import type { SessionUserRole } from "@/lib/session";
import {
  isDashboardAccountPath,
  isDashboardAnalyticsPath,
  isDashboardChargesPath,
  isDashboardHomesPath,
  isDashboardOtherChargesPath,
  isDashboardPaymentsPath,
  isDashboardResidentsPath,
  isDashboardTasksPath,
  isDashboardUsersPath,
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
  if (isDashboardHomesPath(pathname)) {
    return role === "admin" ? "Retirement homes" : "Your homes";
  }
  if (isDashboardChargesPath(pathname)) return "Charges";
  if (isDashboardOtherChargesPath(pathname)) return "Other charges";
  if (isDashboardPaymentsPath(pathname)) return "Payments";
  if (isDashboardUsersPath(pathname)) return "Staff";
  return "Dashboard";
}

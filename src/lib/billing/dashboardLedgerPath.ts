export type DashboardLedgerAccountType = "resident" | "home";

type LedgerPathOpts = {
  residentId?: string | null;
  accountType?: DashboardLedgerAccountType;
};

/**
 * Build `/dashboard/ledger` with query string. When the posted range matches
 * calendar YTD, `postedFrom` / `postedTo` are omitted.
 */
export function buildDashboardLedgerPath(
  homeId: string,
  postedFrom: string,
  postedTo: string,
  ytdPostedFrom: string,
  ytdPostedTo: string,
  opts?: LedgerPathOpts,
): string {
  const p = new URLSearchParams();
  p.set("homeId", homeId);
  const accountType =
    opts?.accountType === "home" ? "home" : "resident";
  p.set("accountType", accountType);
  if (postedFrom !== ytdPostedFrom || postedTo !== ytdPostedTo) {
    p.set("postedFrom", postedFrom);
    p.set("postedTo", postedTo);
  }
  if (accountType === "resident") {
    const residentId = opts?.residentId?.trim() ?? "";
    if (residentId !== "") {
      p.set("resident", residentId);
    }
  }
  return `/dashboard/ledger?${p.toString()}`;
}

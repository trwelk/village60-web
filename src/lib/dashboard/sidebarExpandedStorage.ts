export const DASHBOARD_SIDEBAR_EXPANDED_KEY =
  "village60.dashboard.sidebarExpanded";

export function readSidebarExpandedFromStorage(raw: string | null): boolean {
  if (raw === null) return true;
  if (raw === writeSidebarExpandedToStorage(false)) return false;
  if (raw === writeSidebarExpandedToStorage(true)) return true;
  return true;
}

export function writeSidebarExpandedToStorage(expanded: boolean): string {
  return expanded ? "true" : "false";
}

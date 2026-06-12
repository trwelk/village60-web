export function dashboardMarHref(homeId: string, date?: string): string {
  const params = new URLSearchParams({ homeId });
  if (date) {
    params.set("date", date);
  }
  return `/dashboard/mar?${params.toString()}`;
}

export function dashboardWardsHref(homeId: string): string {
  return `/dashboard/wards?homeId=${encodeURIComponent(homeId)}`;
}

export function dashboardResidentsHref(homeId?: string): string {
  if (!homeId) {
    return "/dashboard/residents";
  }
  return `/dashboard/residents?homeId=${encodeURIComponent(homeId)}`;
}

export function dashboardResidentHref(
  residentId: string,
  tab?: string,
): string {
  const base = `/dashboard/residents/${encodeURIComponent(residentId)}`;
  if (!tab) {
    return base;
  }
  return `${base}?tab=${encodeURIComponent(tab)}`;
}

export function dashboardMedicationsHref(homeId?: string, residentId?: string): string {
  const params = new URLSearchParams();
  if (homeId) params.set("homeId", homeId);
  if (residentId) params.set("residentId", residentId);
  const qs = params.toString();
  return qs ? `/dashboard/medications?${qs}` : "/dashboard/medications";
}

export function dashboardResidentMedicationsHref(residentId: string): string {
  return `/dashboard/residents/${encodeURIComponent(residentId)}/medications`;
}

export function dashboardDepartedResidentsHref(homeId: string): string {
  return `/dashboard/residents/departed?homeId=${encodeURIComponent(homeId)}`;
}

export function dashboardNewResidentHref(homeId: string): string {
  return `/dashboard/residents/new?homeId=${encodeURIComponent(homeId)}`;
}

export function dashboardLedgerHref(homeId: string, residentId?: string): string {
  const params = new URLSearchParams({ homeId });
  if (residentId) {
    params.set("residentId", residentId);
  }
  return `/dashboard/ledger?${params.toString()}`;
}

export function dashboardMedicationReordersHref(homeId?: string): string {
  if (!homeId) {
    return "/dashboard/medication-reorders";
  }
  return `/dashboard/medication-reorders?homeId=${encodeURIComponent(homeId)}`;
}

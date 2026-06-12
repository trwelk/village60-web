import type { SessionUserRole } from "@/lib/session";

export type TabId =
  | "nok"
  | "poa"
  | "assigned-nurse"
  | "conditions"
  | "allergies"
  | "other-charge";

export type Tab = { id: TabId; labelKey: string };

/** Tabs shown to all roles (Care and Admin). */
export const RESIDENT_CORE_TABS: Tab[] = [
  { id: "nok", labelKey: "tabs.nextOfKin" },
  { id: "poa", labelKey: "tabs.poa" },
  { id: "assigned-nurse", labelKey: "tabs.assignedNurse" },
  { id: "conditions", labelKey: "tabs.conditions" },
  { id: "allergies", labelKey: "tabs.allergies" },
];

const OTHER_CHARGE_TAB: Tab = {
  id: "other-charge",
  labelKey: "tabs.otherCharges",
};

export function residentDetailTabsForRole(role: SessionUserRole): Tab[] {
  if (role === "admin") {
    return [...RESIDENT_CORE_TABS, OTHER_CHARGE_TAB];
  }
  return RESIDENT_CORE_TABS;
}

const CORE_TAB_IDS = new Set<string>(RESIDENT_CORE_TABS.map((t) => t.id));

/**
 * Resolves the canonical active tab from a URL search param value.
 * Falls back to the first tab when the param is absent, invalid, or unknown
 * (including legacy `payment` and `billing`). Care users cannot open admin-only tabs.
 */
export function resolveActiveTab(
  param: string | null | undefined,
  role: SessionUserRole,
): TabId {
  if (param === "billing") {
    return "nok";
  }
  if (param === "other-charge") {
    if (role !== "admin") {
      return "nok";
    }
    return "other-charge";
  }
  if (param && CORE_TAB_IDS.has(param)) {
    return param as TabId;
  }
  return "nok";
}

/** @deprecated Prefer {@link RESIDENT_CORE_TABS} or {@link residentDetailTabsForRole}. */
export const TABS = RESIDENT_CORE_TABS;

import type { SessionUserRole } from "@/lib/session";

export type TabId =
  | "nok"
  | "poa"
  | "assigned-nurse"
  | "conditions"
  | "allergies"
  | "medications"
  | "other-charge"
  | "billing";

export type Tab = { id: TabId; label: string };

/** Tabs shown to all roles (Care and Admin). */
export const RESIDENT_CORE_TABS: Tab[] = [
  { id: "nok", label: "Next of Kin" },
  { id: "poa", label: "POA" },
  { id: "assigned-nurse", label: "Assigned Nurse" },
  { id: "conditions", label: "Conditions" },
  { id: "allergies", label: "Allergies" },
  { id: "medications", label: "Medications" },
];

const OTHER_CHARGE_TAB: Tab = { id: "other-charge", label: "Other charges" };
const BILLING_TAB: Tab = { id: "billing", label: "Monthly billing" };

export function residentDetailTabsForRole(role: SessionUserRole): Tab[] {
  if (role === "admin") {
    return [...RESIDENT_CORE_TABS, OTHER_CHARGE_TAB, BILLING_TAB];
  }
  return RESIDENT_CORE_TABS;
}

const CORE_TAB_IDS = new Set<string>(RESIDENT_CORE_TABS.map((t) => t.id));

/**
 * Resolves the canonical active tab from a URL search param value.
 * Falls back to the first tab when the param is absent, invalid, or unknown
 * (including legacy `payment`). Care users cannot open the billing tab.
 */
export function resolveActiveTab(
  param: string | null | undefined,
  role: SessionUserRole,
): TabId {
  if (param === "billing") {
    if (role !== "admin") {
      return "nok";
    }
    return "billing";
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

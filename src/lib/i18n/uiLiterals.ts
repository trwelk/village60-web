import { en } from "./messages/en";

function flattenMessages(
  tree: Record<string, unknown>,
  prefix = "",
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      out[value] = path;
    } else if (typeof value === "object" && value !== null) {
      Object.assign(out, flattenMessages(value as Record<string, unknown>, path));
    }
  }
  return out;
}

/** Alternate spellings found in markup (ellipsis, casing). */
const LITERAL_ALIASES: Record<string, string> = {
  "Saving...": "buttons.saving",
  "Creating...": "buttons.creating",
  "Applying...": "buttons.applying",
  "Adding...": "buttons.adding",
  "Receiving...": "buttons.receiving",
  "Signing out...": "buttons.signingOut",
  Medications: "buttons.medications",
  Invoices: "buttons.invoices",
  Ledger: "buttons.ledger",
  Payments: "buttons.payments",
  Wards: "buttons.wards",
  Filters: "buttons.filters",
  Receive: "buttons.receive",
};

const baseMap = flattenMessages(en as Record<string, unknown>);

export const UI_LITERAL_MAP: Record<string, string> = {
  ...baseMap,
  ...LITERAL_ALIASES,
};

/** @deprecated Use UI_LITERAL_MAP — kept for existing imports. */
export const BUTTON_LITERAL_MAP = UI_LITERAL_MAP;

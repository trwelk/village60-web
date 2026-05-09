export type InvoiceCategoryOption = {
  value: string;
  label: string;
};

export const DEFAULT_INVOICE_CATEGORY_OPTIONS: InvoiceCategoryOption[] = [
  { value: "monthly_fee", label: "Monthly fee" },
  { value: "deposit", label: "Deposit" },
  { value: "registration_fee", label: "Registration fee" },
  { value: "medication", label: "Medication" },
  { value: "inventory_po", label: "Inventory (purchase order)" },
];

export function isMonthlyFeeCategory(raw: string): boolean {
  return raw.trim().toLowerCase() === "monthly_fee";
}

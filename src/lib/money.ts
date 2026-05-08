/**
 * Format an integer cent value as a human-readable currency string.
 * Uses Intl.NumberFormat with the provided ISO 4217 currency code.
 *
 * @param cents  - Integer value in minor currency units (e.g. 1250 = $12.50)
 * @param currencyCode - ISO 4217 code e.g. "NZD", "USD"
 */
export function formatCents(cents: number, currencyCode: string): string {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/**
 * Parse a user-entered price string (e.g. "12.50") into integer cents.
 * Returns null if the value is not a valid positive number.
 */
export function parsePriceToCents(value: string): number | null {
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

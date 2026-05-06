/**
 * Product formula (**34b**): `max(0, floor(minimumInStock * coverageMonths - currentStock))`.
 * Callers omit lines when the result is 0.
 */
export function computeMedicationOrderLineQty(input: {
  minimumInStock: number;
  medicationOrderCoverageMonths: number;
  currentStock: number;
}): number {
  const { minimumInStock, medicationOrderCoverageMonths, currentStock } = input;
  const raw = minimumInStock * medicationOrderCoverageMonths - currentStock;
  return Math.max(0, Math.floor(raw));
}

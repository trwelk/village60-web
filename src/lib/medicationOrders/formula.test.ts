import { describe, expect, it } from "vitest";
import { computeMedicationOrderLineQty } from "./formula";

describe("computeMedicationOrderLineQty (34b)", () => {
  it("orders the shortfall against minimum × months", () => {
    expect(
      computeMedicationOrderLineQty({
        minimumInStock: 10,
        medicationOrderCoverageMonths: 3,
        currentStock: 25,
      }),
    ).toBe(5);
  });

  it("returns 0 when stock already covers the target", () => {
    expect(
      computeMedicationOrderLineQty({
        minimumInStock: 10,
        medicationOrderCoverageMonths: 3,
        currentStock: 30,
      }),
    ).toBe(0);
  });

  it("floors fractional shortfall before applying max(0, …)", () => {
    expect(
      computeMedicationOrderLineQty({
        minimumInStock: 10,
        medicationOrderCoverageMonths: 3,
        currentStock: 29.7,
      }),
    ).toBe(0);
  });
});

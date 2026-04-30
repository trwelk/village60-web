import { describe, expect, it } from "vitest";
import { buildDashboardChargesPath } from "./dashboardChargesPath";

describe("buildDashboardChargesPath", () => {
  it("omits month params when the range matches YTD", () => {
    expect(
      buildDashboardChargesPath("h1", "2026-01", "2026-04", "2026-01", "2026-04"),
    ).toBe("/dashboard/charges?homeId=h1");
  });

  it("includes both month params for a custom range", () => {
    expect(
      buildDashboardChargesPath("h1", "2024-01", "2024-12", "2026-01", "2026-04"),
    ).toBe(
      "/dashboard/charges?homeId=h1&billingMonthFrom=2024-01&billingMonthTo=2024-12",
    );
  });

  it("adds pagination and payment status when not defaulted (22c)", () => {
    expect(
      buildDashboardChargesPath("h1", "2026-01", "2026-04", "2026-01", "2026-04", {
        page: 2,
        paymentStatus: "unpaid",
      }),
    ).toBe("/dashboard/charges?homeId=h1&page=2&paymentStatus=unpaid");
  });
});

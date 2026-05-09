import { describe, expect, it } from "vitest";
import { buildDashboardPaymentsPath } from "./dashboardPaymentsPath";

describe("buildDashboardPaymentsPath", () => {
  it("omits default page params", () => {
    expect(buildDashboardPaymentsPath("h1", 1, 25)).toBe(
      "/dashboard/payments?homeId=h1",
    );
  });

  it("includes residentId when resident filter is selected", () => {
    expect(buildDashboardPaymentsPath("h1", 1, 25, "r1")).toBe(
      "/dashboard/payments?homeId=h1&residentId=r1",
    );
  });

  it("includes non-default pagination", () => {
    expect(buildDashboardPaymentsPath("h1", 3, 50)).toBe(
      "/dashboard/payments?homeId=h1&page=3&pageSize=50",
    );
  });
});

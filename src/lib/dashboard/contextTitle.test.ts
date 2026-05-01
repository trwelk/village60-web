import { describe, expect, it } from "vitest";
import { getDashboardContextTitle } from "./contextTitle";

describe("getDashboardContextTitle", () => {
  it("returns Analytics for /dashboard/analytics", () => {
    expect(getDashboardContextTitle("/dashboard/analytics", "admin")).toBe(
      "Analytics",
    );
  });

  it("still returns Overview for /dashboard", () => {
    expect(getDashboardContextTitle("/dashboard", "admin")).toBe("Overview");
    expect(getDashboardContextTitle("/dashboard", "care")).toBe("Overview");
  });

  it("still returns correct titles for other hub routes", () => {
    expect(getDashboardContextTitle("/dashboard/charges", "admin")).toBe(
      "Charges",
    );
    expect(getDashboardContextTitle("/dashboard/tasks", "care")).toBe("Tasks");
  });

  it("returns Leads for /dashboard/leads", () => {
    expect(getDashboardContextTitle("/dashboard/leads", "admin")).toBe(
      "Leads",
    );
  });
});

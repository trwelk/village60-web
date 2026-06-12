import { createTranslator } from "@/lib/i18n/messages";
import { describe, expect, it } from "vitest";
import { getDashboardContextTitle } from "./contextTitle";

const t = createTranslator("en");

describe("getDashboardContextTitle", () => {
  it("returns Analytics for /dashboard/analytics", () => {
    expect(getDashboardContextTitle("/dashboard/analytics", "admin", t)).toBe(
      "Analytics",
    );
  });

  it("still returns Overview for /dashboard", () => {
    expect(getDashboardContextTitle("/dashboard", "admin", t)).toBe("Overview");
    expect(getDashboardContextTitle("/dashboard", "care", t)).toBe("Overview");
  });

  it("still returns correct titles for other hub routes", () => {
    expect(getDashboardContextTitle("/dashboard/charges", "admin", t)).toBe(
      "Charges",
    );
    expect(getDashboardContextTitle("/dashboard/tasks", "care", t)).toBe("Tasks");
    expect(
      getDashboardContextTitle("/dashboard/inventory-orders", "admin", t),
    ).toBe("Inventory orders");
  });

  it("returns Waiting list for /dashboard/waiting-list", () => {
    expect(
      getDashboardContextTitle("/dashboard/waiting-list", "admin", t),
    ).toBe("Waiting list");
  });
});

import { describe, expect, it } from "vitest";
import { residentDetailTabsForRole, resolveActiveTab } from "./tabs";

describe("residentDetailTabsForRole", () => {
  it("includes other-charge and monthly billing only for admin", () => {
    const adminIds = residentDetailTabsForRole("admin").map((t) => t.id);
    expect(adminIds).toContain("other-charge");
    expect(adminIds).toContain("billing");
    const careIds = residentDetailTabsForRole("care").map((t) => t.id);
    expect(careIds).not.toContain("other-charge");
    expect(careIds).not.toContain("billing");
  });
});

describe("resolveActiveTab", () => {
  it("defaults to nok when param is null", () => {
    expect(resolveActiveTab(null, "care")).toBe("nok");
    expect(resolveActiveTab(null, "admin")).toBe("nok");
  });

  it("defaults to nok when param is undefined", () => {
    expect(resolveActiveTab(undefined, "admin")).toBe("nok");
  });

  it("defaults to nok when param is an unknown value", () => {
    expect(resolveActiveTab("garbage", "admin")).toBe("nok");
  });

  it("defaults to nok for legacy payment tab param", () => {
    expect(resolveActiveTab("payment", "admin")).toBe("nok");
  });

  it("returns the tab when a valid param is given", () => {
    expect(resolveActiveTab("medications", "admin")).toBe("medications");
    expect(resolveActiveTab("conditions", "care")).toBe("conditions");
    expect(resolveActiveTab("allergies", "admin")).toBe("allergies");
    expect(resolveActiveTab("poa", "care")).toBe("poa");
    expect(resolveActiveTab("assigned-nurse", "admin")).toBe("assigned-nurse");
    expect(resolveActiveTab("nok", "care")).toBe("nok");
  });

  it("allows billing tab only for admin", () => {
    expect(resolveActiveTab("billing", "admin")).toBe("billing");
    expect(resolveActiveTab("billing", "care")).toBe("nok");
  });

  it("allows other-charge tab only for admin", () => {
    expect(resolveActiveTab("other-charge", "admin")).toBe("other-charge");
    expect(resolveActiveTab("other-charge", "care")).toBe("nok");
  });
});

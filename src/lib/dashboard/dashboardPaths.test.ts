import { describe, expect, it } from "vitest";
import {
  isDashboardAnalyticsPath,
  isDashboardAccountPath,
  isDashboardHomesPath,
  isDashboardResidentsPath,
} from "./dashboardPaths";

describe("isDashboardAnalyticsPath", () => {
  it("matches /dashboard/analytics exactly", () => {
    expect(isDashboardAnalyticsPath("/dashboard/analytics")).toBe(true);
  });

  it("does not match the overview root", () => {
    expect(isDashboardAnalyticsPath("/dashboard")).toBe(false);
  });

  it("does not match other dashboard paths", () => {
    expect(isDashboardAnalyticsPath("/dashboard/charges")).toBe(false);
    expect(isDashboardAnalyticsPath("/dashboard/residents")).toBe(false);
    expect(isDashboardAnalyticsPath("/dashboard/account")).toBe(false);
  });

  it("does not match paths that merely contain 'analytics'", () => {
    expect(isDashboardAnalyticsPath("/dashboard/analytics/something")).toBe(false);
  });
});

describe("existing path predicates are unaffected", () => {
  it("isDashboardAccountPath still works", () => {
    expect(isDashboardAccountPath("/dashboard/account")).toBe(true);
    expect(isDashboardAccountPath("/dashboard/analytics")).toBe(false);
  });

  it("isDashboardHomesPath still works", () => {
    expect(isDashboardHomesPath("/dashboard/homes")).toBe(true);
    expect(isDashboardHomesPath("/dashboard/analytics")).toBe(false);
  });

  it("isDashboardResidentsPath still works", () => {
    expect(isDashboardResidentsPath("/dashboard/residents")).toBe(true);
    expect(isDashboardResidentsPath("/dashboard/analytics")).toBe(false);
  });
});

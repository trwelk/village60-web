import { describe, expect, it } from "vitest";
import {
  isDashboardAnalyticsAdmissionsDeparturesPath,
  isDashboardAnalyticsDemographicsStaffPath,
  isDashboardAnalyticsFinancialPath,
  isDashboardAnalyticsPath,
  isDashboardAccountPath,
  isDashboardHomesPath,
  isDashboardInventoryOrdersPath,
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

  it("matches nested analytics routes", () => {
    expect(
      isDashboardAnalyticsPath("/dashboard/analytics/financial"),
    ).toBe(true);
    expect(
      isDashboardAnalyticsPath("/dashboard/analytics/admissions-departures"),
    ).toBe(true);
  });

  it("does not match unrelated /dashboard/analytics-ish paths", () => {
    expect(isDashboardAnalyticsPath("/dashboard/analytics-evil")).toBe(false);
  });
});

describe("analytics subsection paths", () => {
  it("isDashboardAnalyticsFinancialPath matches index and financial", () => {
    expect(
      isDashboardAnalyticsFinancialPath("/dashboard/analytics/financial"),
    ).toBe(true);
    expect(
      isDashboardAnalyticsFinancialPath("/dashboard/analytics"),
    ).toBe(true);
    expect(
      isDashboardAnalyticsFinancialPath(
        "/dashboard/analytics/admissions-departures",
      ),
    ).toBe(false);
  });

  it("isDashboardAnalyticsAdmissionsDeparturesPath", () => {
    expect(
      isDashboardAnalyticsAdmissionsDeparturesPath(
        "/dashboard/analytics/admissions-departures",
      ),
    ).toBe(true);
    expect(
      isDashboardAnalyticsAdmissionsDeparturesPath(
        "/dashboard/analytics/financial",
      ),
    ).toBe(false);
  });

  it("isDashboardAnalyticsDemographicsStaffPath", () => {
    expect(
      isDashboardAnalyticsDemographicsStaffPath(
        "/dashboard/analytics/demographics-staff",
      ),
    ).toBe(true);
    expect(
      isDashboardAnalyticsDemographicsStaffPath("/dashboard/analytics"),
    ).toBe(false);
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
    expect(isDashboardResidentsPath("/dashboard/residents/new")).toBe(true);
    expect(isDashboardResidentsPath("/dashboard/analytics")).toBe(false);
  });

  it("isDashboardInventoryOrdersPath works", () => {
    expect(isDashboardInventoryOrdersPath("/dashboard/inventory-orders")).toBe(
      true,
    );
    expect(
      isDashboardInventoryOrdersPath("/dashboard/inventory-orders/po-123"),
    ).toBe(true);
    expect(
      isDashboardInventoryOrdersPath("/dashboard/inventory-orders/catalog"),
    ).toBe(false);
    expect(
      isDashboardInventoryOrdersPath("/dashboard/inventory-orders/suppliers"),
    ).toBe(false);
    expect(isDashboardInventoryOrdersPath("/dashboard/tasks")).toBe(false);
  });
});

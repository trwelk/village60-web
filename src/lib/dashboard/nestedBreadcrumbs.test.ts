import { describe, expect, it } from "vitest";
import {
  buildHomeAreaBreadcrumbTrail,
  buildResidentDetailBreadcrumbTrail,
} from "./nestedBreadcrumbs";
import { isHomeResidentDetailPath } from "./dashboardPaths";

describe("isHomeResidentDetailPath", () => {
  it("is true for a per-resident record under a home (not list, not new, not departed)", () => {
    expect(
      isHomeResidentDetailPath(
        "/dashboard/homes/h-1/residents/550e8400-e29b-41d4-a716-446655440000",
      ),
    ).toBe(true);
  });

  it("is false for the residents list and special sub-routes", () => {
    expect(
      isHomeResidentDetailPath("/dashboard/homes/h-1/residents"),
    ).toBe(false);
    expect(
      isHomeResidentDetailPath("/dashboard/homes/h-1/residents/new"),
    ).toBe(false);
    expect(
      isHomeResidentDetailPath("/dashboard/homes/h-1/residents/departed"),
    ).toBe(false);
  });
});

describe("buildHomeAreaBreadcrumbTrail", () => {
  const base = {
    homeId: "h1",
    homeLabel: "Sunrise Villa",
  };

  it("produces a trail for the wards sub-route with home as second link to residents directory", () => {
    const trail = buildHomeAreaBreadcrumbTrail(
      "/dashboard/homes/h1/wards",
      { ...base, role: "admin" },
    );
    expect(trail).toEqual([
      { label: "Retirement homes", href: "/dashboard/homes" },
      {
        label: "Sunrise Villa",
        href: "/dashboard/homes/h1/residents",
        currentPage: false,
      },
      { label: "Wards", currentPage: true },
    ]);
  });

  it("uses care-specific hub label and marks the last segment for the residents list", () => {
    const trail = buildHomeAreaBreadcrumbTrail(
      "/dashboard/homes/h1/residents",
      { ...base, role: "care" },
    );
    expect(trail).not.toBeNull();
    expect(trail![0]!.label).toBe("Your homes");
    expect(trail![2]).toEqual({ label: "Residents", currentPage: true });
  });

  it("labels new and departed under residents", () => {
    expect(
      buildHomeAreaBreadcrumbTrail("/dashboard/homes/h1/residents/new", {
        ...base,
        role: "admin",
      })?.map((c) => c.label),
    ).toEqual(["Retirement homes", "Sunrise Villa", "Residents", "New resident"]);

    expect(
      buildHomeAreaBreadcrumbTrail(
        "/dashboard/homes/h1/residents/departed",
        { ...base, role: "admin" },
      )?.map((c) => c.label),
    ).toEqual([
      "Retirement homes",
      "Sunrise Villa",
      "Residents",
      "Departed residents",
    ]);
  });
});

describe("buildResidentDetailBreadcrumbTrail", () => {
  it("adds a linked Residents step and a current resident when names are available", () => {
    const trail = buildResidentDetailBreadcrumbTrail({
      role: "admin",
      homeId: "h1",
      homeLabel: "Sunrise Villa",
      residentId: "r1",
      residentLabel: "Jamie River",
    });
    expect(trail[2]).toEqual({
      label: "Residents",
      href: "/dashboard/homes/h1/residents",
      currentPage: false,
    });
    expect(trail[3]).toEqual({
      label: "Jamie River",
      currentPage: true,
    });
  });

  it("uses safe fallbacks for missing data", () => {
    const trail = buildResidentDetailBreadcrumbTrail({
      role: "care",
      homeId: "h1",
      homeLabel: "   ",
      residentId: "r1",
      residentLabel: "",
    });
    expect(trail[0]!.label).toBe("Your homes");
    expect(trail[1]!.label).toBe("Home");
    expect(trail[3]!.label).toBe("Resident");
  });
});

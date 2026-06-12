import { describe, expect, it } from "vitest";
import {
  isDashboardHomesPath,
  isDashboardInventoryOrdersPath,
  isDashboardResidentsPath,
} from "./dashboardPaths";
import {
  buildNavSubChildrenFromBreadcrumbs,
  findActiveNavParentHref,
  homeMarNavInjection,
  mergeNavSubEntryInjections,
  resolveNavParentHref,
  resolveNavSubEntryInjection,
} from "./navSubEntries";

const adminProbes = [
  {
    kind: "group" as const,
    items: [
      {
        href: "/dashboard/residents",
        isActive: isDashboardResidentsPath,
      },
      {
        href: "/dashboard/mar",
        isActive: (p: string) =>
          p === "/dashboard/mar" ||
          /\/dashboard\/homes\/[^/]+\/mar(\/|$)/.test(p),
      },
      {
        href: "/dashboard/homes",
        isActive: isDashboardHomesPath,
      },
      {
        href: "/dashboard/tasks",
        isActive: (p: string) => p === "/dashboard/tasks",
      },
    ],
  },
  {
    kind: "group" as const,
    items: [
      {
        href: "/dashboard/inventory-orders",
        isActive: isDashboardInventoryOrdersPath,
      },
    ],
  },
];

describe("resolveNavParentHref", () => {
  it("prefers retirement homes for a home-area breadcrumb trail", () => {
    expect(
      resolveNavParentHref(
        adminProbes,
        "/dashboard/homes/h1/residents",
        [
          { label: "Retirement homes", href: "/dashboard/homes" },
          { label: "Alpine View Lodge", href: "/dashboard/homes/h1/residents" },
          { label: "Residents", currentPage: true },
        ],
      ),
    ).toBe("/dashboard/homes");
  });

  it("keeps residents as parent for a per-resident record", () => {
    expect(
      resolveNavParentHref(
        adminProbes,
        "/dashboard/homes/h1/residents/r1",
        [
          { label: "Retirement homes", href: "/dashboard/homes" },
          { label: "Alpine View Lodge", href: "/dashboard/homes/h1/residents" },
          {
            label: "Residents",
            href: "/dashboard/homes/h1/residents",
            currentPage: false,
          },
          { label: "Jamie River", currentPage: true },
        ],
      ),
    ).toBe("/dashboard/residents");
  });
});

describe("findActiveNavParentHref", () => {
  it("selects daily MAR for flat MAR route", () => {
    expect(findActiveNavParentHref(adminProbes, "/dashboard/mar")).toBe(
      "/dashboard/mar",
    );
  });

  it("selects daily MAR for legacy nested MAR route", () => {
    expect(
      findActiveNavParentHref(
        adminProbes,
        "/dashboard/homes/h1/mar",
      ),
    ).toBe("/dashboard/mar");
  });

  it("selects residents for a home resident record", () => {
    expect(
      findActiveNavParentHref(
        adminProbes,
        "/dashboard/homes/h1/residents/r1",
      ),
    ).toBe("/dashboard/residents");
  });
});

describe("buildNavSubChildrenFromBreadcrumbs", () => {
  it("returns the current page segment for a home sub-route trail", () => {
    const children = buildNavSubChildrenFromBreadcrumbs(
      [
        { label: "Retirement homes", href: "/dashboard/homes" },
        {
          label: "Alpine View Lodge",
          href: "/dashboard/residents?homeId=h1",
        },
        { label: "Daily MAR", currentPage: true },
      ],
      "/dashboard/mar",
    );
    expect(children).toEqual([
      {
        href: "/dashboard/mar",
        label: "Daily MAR",
        isActive: expect.any(Function),
      },
    ]);
    expect(children![0]!.isActive("/dashboard/mar")).toBe(true);
  });
});

describe("resolveNavSubEntryInjection", () => {
  it("builds a nested row for daily MAR under retirement homes", () => {
    const injection = resolveNavSubEntryInjection(
      adminProbes,
      "/dashboard/mar",
      [
        { label: "Retirement homes", href: "/dashboard/homes" },
        {
          label: "Alpine View Lodge",
          href: "/dashboard/residents?homeId=h1",
        },
        { label: "Daily MAR", currentPage: true },
      ],
    );
    expect(injection).toEqual({
      parentHref: "/dashboard/mar",
      children: [
        expect.objectContaining({ label: "Daily MAR", href: "/dashboard/mar" }),
      ],
    });
  });

  it("merges breadcrumb and persistent MAR injections without duplicates", () => {
    const merged = mergeNavSubEntryInjections(
      resolveNavSubEntryInjection(
        adminProbes,
        "/dashboard/mar",
        [
          { label: "Retirement homes", href: "/dashboard/homes" },
          {
            label: "Alpine View Lodge",
            href: "/dashboard/residents?homeId=h1",
          },
          { label: "Daily MAR", currentPage: true },
        ],
      ),
      homeMarNavInjection("/dashboard/mar", "Daily MAR", "h1"),
    );
    expect(merged).toEqual([
      {
        parentHref: "/dashboard/mar",
        children: [
          expect.objectContaining({
            label: "Daily MAR",
            href: "/dashboard/mar",
          }),
        ],
      },
      {
        parentHref: "/dashboard/homes",
        children: [
          expect.objectContaining({
            label: "Daily MAR",
            href: "/dashboard/mar?homeId=h1",
          }),
        ],
      },
    ]);
  });

  it("always injects daily MAR under retirement homes when a home id is in the route", () => {
    const injection = homeMarNavInjection(
      "/dashboard/homes/h1/residents",
      "Daily MAR",
    );
    expect(injection).toEqual({
      parentHref: "/dashboard/homes",
      children: [
        expect.objectContaining({
          label: "Daily MAR",
          href: "/dashboard/mar?homeId=h1",
        }),
      ],
    });
  });

  it("uses query home id for flat MAR route", () => {
    expect(
      homeMarNavInjection("/dashboard/mar", "Daily MAR", "h1"),
    ).toEqual({
      parentHref: "/dashboard/homes",
      children: [
        expect.objectContaining({
          label: "Daily MAR",
          href: "/dashboard/mar?homeId=h1",
        }),
      ],
    });
  });

  it("does not inject daily MAR on the homes hub list", () => {
    expect(homeMarNavInjection("/dashboard/homes", "Daily MAR")).toBeNull();
  });

  it("does not inject daily MAR for inventory routes scoped by query home id", () => {
    expect(
      homeMarNavInjection(
        "/dashboard/inventory-orders/po-1",
        "Daily MAR",
        "h1",
      ),
    ).toBeNull();
  });

  it("builds a nested row for a home residents list under retirement homes", () => {
    const injection = resolveNavSubEntryInjection(
      adminProbes,
      "/dashboard/homes/h1/residents",
      [
        { label: "Retirement homes", href: "/dashboard/homes" },
        {
          label: "Alpine View Lodge",
          href: "/dashboard/homes/h1/residents",
        },
        { label: "Residents", currentPage: true },
      ],
    );
    expect(injection).toEqual({
      parentHref: "/dashboard/homes",
      children: [
        expect.objectContaining({ label: "Residents", href: "/dashboard/homes/h1/residents" }),
      ],
    });
  });

  it("builds a nested row for a resident record under residents", () => {
    const injection = resolveNavSubEntryInjection(
      adminProbes,
      "/dashboard/homes/h1/residents/r1",
      [
        { label: "Retirement homes", href: "/dashboard/homes" },
        {
          label: "Alpine View Lodge",
          href: "/dashboard/homes/h1/residents",
        },
        {
          label: "Residents",
          href: "/dashboard/homes/h1/residents",
          currentPage: false,
        },
        { label: "Jamie River", currentPage: true },
      ],
    );
    expect(injection?.parentHref).toBe("/dashboard/residents");
    expect(injection?.children[0]?.label).toBe("Jamie River");
  });

  it("builds a nested row for invoice detail under invoices", () => {
    const billingProbes = [
      ...adminProbes,
      {
        kind: "group" as const,
        items: [
          {
            href: "/dashboard/invoices",
            isActive: (p: string) =>
              p === "/dashboard/invoices" ||
              /^\/dashboard\/invoices\/[^/]+$/.test(p),
          },
        ],
      },
    ];
    const injection = resolveNavSubEntryInjection(
      billingProbes,
      "/dashboard/invoices/inv-1",
      [
        { label: "Invoices", href: "/dashboard/invoices", currentPage: false },
        { label: "INV-1001", currentPage: true },
      ],
    );
    expect(injection?.parentHref).toBe("/dashboard/invoices");
    expect(injection?.children[0]?.label).toBe("INV-1001");
  });

  it("builds a nested row for purchase order detail under inventory orders", () => {
    const injection = resolveNavSubEntryInjection(
      adminProbes,
      "/dashboard/inventory-orders/po-1",
      [
        { label: "Inventory orders", href: "/dashboard/inventory-orders" },
        { label: "PO-1001", currentPage: true },
      ],
    );
    expect(injection?.parentHref).toBe("/dashboard/inventory-orders");
    expect(injection?.children[0]?.label).toBe("PO-1001");
  });
});

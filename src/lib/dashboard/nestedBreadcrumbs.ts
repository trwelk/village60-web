import type { SessionUserRole } from "@/lib/session";
import {
  dashboardResidentHref,
  dashboardResidentsHref,
} from "./dashboardRoutes";
import { isHomeResidentDetailPath } from "./dashboardPaths";

/**
 * Breadcrumb for the dashboard top bar (23c). Last segment with `currentPage: true` has
 * no `href`; earlier segments with `href` are links. `currentPage` is omitted when false.
 */
export type NavCrumb = {
  label: string;
  href?: string;
  currentPage?: boolean;
};

/** Two-level trail for hub list → detail (sidebar + top bar), e.g. inventory orders → PO. */
export function buildHubDetailBreadcrumbTrail(
  hubLabel: string,
  hubHref: string,
  detailLabel: string,
): NavCrumb[] {
  return [
    { label: hubLabel, href: hubHref, currentPage: false },
    { label: detailLabel, currentPage: true },
  ];
}

function homesHubLabel(role: SessionUserRole): string {
  return role === "admin" ? "Retirement homes" : "Your homes";
}

/**
 * Breadcrumb for flat home-scoped pages (MAR, wards, departed, etc.).
 */
export function buildFlatHomeScopedBreadcrumbTrail(
  sectionLabel: string,
  input: { homeId: string; homeLabel: string; role: SessionUserRole },
): NavCrumb[] {
  const homeName = input.homeLabel.trim() || "Home";
  return [
    { label: homesHubLabel(input.role), href: "/dashboard/homes" },
    {
      label: homeName,
      href: dashboardResidentsHref(input.homeId),
      currentPage: false,
    },
    { label: sectionLabel, currentPage: true },
  ];
}

/**
 * Breadcrumb under `/dashboard/homes/[homeId]/*` excluding resident detail, which
 * uses {@link buildResidentDetailBreadcrumbTrail}.
 */
export function buildHomeAreaBreadcrumbTrail(
  pathname: string,
  input: { homeId: string; homeLabel: string; role: SessionUserRole },
): NavCrumb[] | null {
  if (isHomeResidentDetailPath(pathname)) {
    return null;
  }
  const homeName = input.homeLabel.trim() || "Home";
  const re = new RegExp(
    `^/dashboard/homes/${escapeRe(input.homeId)}/(wards|ledger|mar|invoices|residents(?:/.*)?)$`,
  );
  const m = re.exec(pathname);
  if (!m) {
    return null;
  }
  const rest = m[1] ?? "";
  const hub: NavCrumb = {
    label: homesHubLabel(input.role),
    href: "/dashboard/homes",
  };
  const home: NavCrumb = {
    label: homeName,
    href: dashboardResidentsHref(input.homeId),
    currentPage: false,
  };
  if (rest === "wards") {
    return [hub, home, { label: "Wards", currentPage: true }];
  }
  if (rest === "ledger") {
    return [hub, home, { label: "Ledger", currentPage: true }];
  }
  if (rest === "mar") {
    return [hub, home, { label: "Daily MAR", currentPage: true }];
  }
  if (rest === "invoices") {
    return [hub, home, { label: "Invoices", currentPage: true }];
  }
  if (rest === "residents/new") {
    return [
      hub,
      home,
      {
        label: "Residents",
        href: dashboardResidentsHref(input.homeId),
        currentPage: false,
      },
      { label: "New resident", currentPage: true },
    ];
  }
  if (rest === "residents/departed") {
    return [
      hub,
      home,
      {
        label: "Residents",
        href: dashboardResidentsHref(input.homeId),
        currentPage: false,
      },
      { label: "Departed residents", currentPage: true },
    ];
  }
  if (rest === "residents") {
    return [hub, home, { label: "Residents", currentPage: true }];
  }
  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[\\^$*+?.()|[\]{}]/g, "\\$&");
}

/**
 * Breadcrumb for resident detail (flat or legacy nested path).
 */
export function buildResidentDetailBreadcrumbTrail(input: {
  role: SessionUserRole;
  homeId: string;
  homeLabel: string;
  residentId: string;
  residentLabel: string;
}): NavCrumb[] {
  const homeName = input.homeLabel.trim() || "Home";
  const resident = input.residentLabel.trim() || "Resident";
  return [
    { label: homesHubLabel(input.role), href: "/dashboard/homes" },
    {
      label: homeName,
      href: dashboardResidentsHref(input.homeId),
      currentPage: false,
    },
    {
      label: "Residents",
      href: dashboardResidentsHref(input.homeId),
      currentPage: false,
    },
    {
      label: resident,
      href: dashboardResidentHref(input.residentId),
      currentPage: true,
    },
  ];
}

export function buildFlatMarBreadcrumbTrail(input: {
  homeId: string;
  homeLabel: string;
  role: SessionUserRole;
}): NavCrumb[] {
  return buildFlatHomeScopedBreadcrumbTrail("Daily MAR", input);
}

export function buildFlatWardsBreadcrumbTrail(input: {
  homeId: string;
  homeLabel: string;
  role: SessionUserRole;
}): NavCrumb[] {
  return buildFlatHomeScopedBreadcrumbTrail("Wards", input);
}

export function buildFlatDepartedBreadcrumbTrail(input: {
  homeId: string;
  homeLabel: string;
  role: SessionUserRole;
}): NavCrumb[] {
  return buildFlatHomeScopedBreadcrumbTrail("Departed residents", input);
}

export function buildFlatResidentMedicationsBreadcrumbTrail(input: {
  role: SessionUserRole;
  homeId: string;
  homeLabel: string;
  residentId: string;
  residentLabel: string;
}): NavCrumb[] {
  const homeName = input.homeLabel.trim() || "Home";
  const resident = input.residentLabel.trim() || "Resident";
  return [
    { label: homesHubLabel(input.role), href: "/dashboard/homes" },
    {
      label: homeName,
      href: dashboardResidentsHref(input.homeId),
      currentPage: false,
    },
    {
      label: "Residents",
      href: dashboardResidentsHref(input.homeId),
      currentPage: false,
    },
    {
      label: resident,
      href: dashboardResidentHref(input.residentId),
      currentPage: false,
    },
    { label: "Medications", currentPage: true },
  ];
}

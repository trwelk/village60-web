import type { SessionUserRole } from "@/lib/session";
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

function homesHubLabel(role: SessionUserRole): string {
  return role === "admin" ? "Retirement homes" : "Your homes";
}

function homePrimaryHref(homeId: string): string {
  return `/dashboard/homes/${homeId}/residents`;
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
    `^/dashboard/homes/${escapeRe(input.homeId)}/(wards|residents(?:/.*)?)$`,
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
    href: homePrimaryHref(input.homeId),
    currentPage: false,
  };
  if (rest === "wards") {
    return [hub, home, { label: "Wards", currentPage: true }];
  }
  if (rest === "residents/new") {
    return [
      hub,
      home,
      {
        label: "Residents",
        href: homePrimaryHref(input.homeId),
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
        href: homePrimaryHref(input.homeId),
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
 * Breadcrumb for `/dashboard/homes/.../residents/residentId` (per-resident record).
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
      href: homePrimaryHref(input.homeId),
      currentPage: false,
    },
    {
      label: "Residents",
      href: `/dashboard/homes/${input.homeId}/residents`,
      currentPage: false,
    },
    { label: resident, currentPage: true },
  ];
}

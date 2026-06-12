import type { NavCrumb } from "./nestedBreadcrumbs";
import { dashboardMarHref } from "./dashboardRoutes";
import {
  extractDashboardHomeIdFromPathname,
  isDashboardLedgerPath,
  isDashboardMarPath,
  isDashboardResidentsPath,
  isDashboardWardsPath,
  isHomeResidentDetailPath,
} from "./dashboardPaths";

/** Leaf data for a nested sidebar row (icon supplied when merging into nav). */
export type NavSubLeaf = {
  href: string;
  label: string;
  isActive: (pathname: string) => boolean;
};

export type NavSubEntryInjection = {
  parentHref: string;
  children: NavSubLeaf[];
};

type NavLeafProbe = {
  href: string;
  isActive: (pathname: string) => boolean;
};

type NavGroupProbe = {
  kind: "group";
  items: NavLeafProbe[];
};

type NavEntryProbe = NavLeafProbe | NavGroupProbe;

function isNavGroup(entry: NavEntryProbe): entry is NavGroupProbe {
  return "kind" in entry && entry.kind === "group";
}

/** First primary-nav leaf whose `isActive` matches (group order, then item order). */
export function findActiveNavParentHref(
  entries: NavEntryProbe[],
  pathname: string,
): string | null {
  for (const entry of entries) {
    if (isNavGroup(entry)) {
      for (const item of entry.items) {
        if (item.isActive(pathname)) {
          return item.href;
        }
      }
    } else if (entry.isActive(pathname)) {
      return entry.href;
    }
  }
  return null;
}

/**
 * Prefer retirement homes for home-area trails; otherwise match pathname to a nav leaf.
 */
export function resolveNavParentHref(
  entries: NavEntryProbe[],
  pathname: string,
  breadcrumbs: NavCrumb[] | null,
): string | null {
  if (
    breadcrumbs?.[0]?.href === "/dashboard/homes" &&
    extractDashboardHomeIdFromPathname(pathname) &&
    !isHomeResidentDetailPath(pathname)
  ) {
    return "/dashboard/homes";
  }

  return findActiveNavParentHref(entries, pathname);
}

function crumbToLeaf(
  crumb: NavCrumb,
  pathname: string,
): NavSubLeaf {
  const href = crumb.href ?? pathname;
  return {
    href,
    label: crumb.label,
    isActive: (p) => p === href,
  };
}

/**
 * When breadcrumbs describe a detail view, return a single nested row for the
 * current page (last segment with no link or `currentPage`).
 */
export function buildNavSubChildrenFromBreadcrumbs(
  crumbs: NavCrumb[],
  pathname: string,
): NavSubLeaf[] | null {
  if (crumbs.length < 2) {
    return null;
  }
  const last = crumbs[crumbs.length - 1]!;
  const isCurrentDetail = last.currentPage === true || last.href == null;
  if (!isCurrentDetail) {
    return null;
  }
  return [crumbToLeaf(last, pathname)];
}

/** Detail routes that do not register a breadcrumb trail yet. */
export function buildNavSubChildrenFromPathname(
  pathname: string,
): NavSubEntryInjection | null {
  const invoiceDetail = /^\/dashboard\/invoices\/([^/]+)$/.exec(pathname);
  if (invoiceDetail) {
    return {
      parentHref: "/dashboard/invoices",
      children: [
        {
          href: pathname,
          label: "Invoice",
          isActive: (p) => p === pathname,
        },
      ],
    };
  }

  const homeInvoiceDetail =
    /^\/dashboard\/homes\/[^/]+\/invoices\/([^/]+)$/.exec(pathname);
  if (homeInvoiceDetail) {
    return {
      parentHref: "/dashboard/homes",
      children: [
        {
          href: pathname,
          label: "Invoice",
          isActive: (p) => p === pathname,
        },
      ],
    };
  }

  return null;
}

export function resolveNavSubEntryInjection(
  entries: NavEntryProbe[],
  pathname: string,
  breadcrumbs: NavCrumb[] | null,
): NavSubEntryInjection | null {
  const parentHref = resolveNavParentHref(entries, pathname, breadcrumbs);
  if (!parentHref) {
    return null;
  }

  if (breadcrumbs?.length) {
    const children = buildNavSubChildrenFromBreadcrumbs(breadcrumbs, pathname);
    if (children?.length) {
      return { parentHref, children };
    }
  }

  const fallback = buildNavSubChildrenFromPathname(pathname);
  if (fallback && fallback.parentHref === parentHref) {
    return fallback;
  }

  return null;
}

/** Flat or nested admin routes where ?homeId= scopes retirement-home context. */
function isHomeMarNavShortcutPath(pathname: string): boolean {
  if (extractDashboardHomeIdFromPathname(pathname)) {
    return true;
  }
  return (
    isDashboardMarPath(pathname) ||
    isDashboardResidentsPath(pathname) ||
    isDashboardWardsPath(pathname) ||
    isDashboardLedgerPath(pathname)
  );
}

/** Daily MAR nested under retirement homes when a home id is known. */
export function homeMarNavInjection(
  pathname: string,
  label: string,
  queryHomeId?: string | null,
): NavSubEntryInjection | null {
  const homeId =
    extractDashboardHomeIdFromPathname(pathname) ??
    (queryHomeId && isHomeMarNavShortcutPath(pathname) ? queryHomeId : null);
  if (!homeId) {
    return null;
  }
  return {
    parentHref: "/dashboard/homes",
    children: [
      {
        href: dashboardMarHref(homeId),
        label,
        // Shortcut under Retirement homes; primary Daily MAR row owns MAR routes.
        isActive: () => false,
      },
    ],
  };
}

/** Merge injections that may target different primary-nav parents. */
export function mergeNavSubEntryInjections(
  ...injections: (NavSubEntryInjection | null | undefined)[]
): NavSubEntryInjection[] {
  const byParent = new Map<string, NavSubLeaf[]>();

  for (const injection of injections) {
    if (!injection?.children.length) {
      continue;
    }
    const existing = byParent.get(injection.parentHref) ?? [];
    const seen = new Set(existing.map((c) => c.href));
    for (const child of injection.children) {
      if (seen.has(child.href)) {
        continue;
      }
      seen.add(child.href);
      existing.push(child);
    }
    byParent.set(injection.parentHref, existing);
  }

  return [...byParent.entries()].map(([parentHref, children]) => ({
    parentHref,
    children,
  }));
}

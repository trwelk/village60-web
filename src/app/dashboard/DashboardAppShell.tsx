"use client";

import type { NavCrumb } from "@/lib/dashboard/nestedBreadcrumbs";
import type { SessionUserRole } from "@/lib/session";
import { getDashboardContextTitle } from "@/lib/dashboard/contextTitle";
import { useDashboardWayfinding } from "./DashboardWayfinding";
import {
  isDashboardAccountPath,
  isDashboardAnalyticsAdmissionsDeparturesPath,
  isDashboardAnalyticsDemographicsStaffPath,
  isDashboardAnalyticsOccupancyPath,
  isDashboardAnalyticsFinancialPath,
  isDashboardChargesPath,
  isDashboardHomeExpensesPath,
  isDashboardHomesPath,
  isDashboardInvoicesPath,
  isDashboardLedgerPath,
  isDashboardInventoryCatalogPath,
  isDashboardInventoryOrdersPath,
  isDashboardInventorySuppliersPath,
  isDashboardWaitingListPath,
  isDashboardPaymentsPath,
  isDashboardHomeAccountPaymentsPath,
  isDashboardResidentsPath,
  isDashboardTasksPath,
  isDashboardUsersPath,
  isDashboardAdminSettingsPath,
} from "@/lib/dashboard/dashboardPaths";
import {
  DASHBOARD_SIDEBAR_EXPANDED_KEY,
  readSidebarExpandedFromStorage,
  writeSidebarExpandedToStorage,
} from "@/lib/dashboard/sidebarExpandedStorage";
import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  BarChart3,
  BookOpen,
  Building2,
  ChevronRight,
  ClipboardList,
  DoorOpen,
  FileSpreadsheet,
  Inbox,
  Landmark,
  LayoutDashboard,
  LayoutGrid,
  PackageSearch,
  PanelLeft,
  PanelLeftClose,
  PieChart,
  Receipt,
  Settings,
  ShoppingCart,
  UserCircle,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { LogoutButton } from "./LogoutButton";
import { NavigationProgress } from "./NavigationProgress";

function DashboardBreadcrumbNav({ crumbs }: { crumbs: NavCrumb[] }) {
  return (
    <nav aria-label="Breadcrumb" id="village-dashboard-context-title">
      <ol className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[var(--text-primary)] sm:gap-x-2">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <li
              key={`${crumb.label}-${i}`}
              className="flex min-w-0 max-w-full items-baseline gap-x-1.5 sm:gap-x-2"
            >
              {i > 0 ? (
                <span
                  aria-hidden
                  className="shrink-0 text-ink/30 select-none sm:text-sm"
                >
                  /
                </span>
              ) : null}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="min-w-0 truncate font-medium text-[var(--highlight)] underline decoration-[color:color-mix(in_srgb,var(--highlight)_35%,transparent)] underline-offset-[3px] transition hover:decoration-[color:color-mix(in_srgb,var(--highlight)_62%,transparent)] sm:text-base"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className="min-w-0 truncate font-display text-lg font-semibold sm:text-xl"
                  aria-current={isLast || crumb.currentPage ? "page" : undefined}
                >
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

type DashboardAppShellProps = {
  email: string;
  role: SessionUserRole;
  children: React.ReactNode;
};

const MAIN_ID = "village-dashboard-main";

function focusableIn(container: HTMLElement): HTMLElement[] {
  const sel = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");
  const candidates = Array.from(
    container.querySelectorAll<HTMLElement>(sel),
  ).filter((el) => !el.hasAttribute("inert") && !el.closest("[inert]"));
  const visible = candidates.filter(
    (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0,
  );
  return visible.length > 0 ? visible : candidates;
}

type NavLinkItem = {
  kind: "link";
  href: string;
  label: string;
  Icon: LucideIcon;
  isActive: (pathname: string) => boolean;
};

type NavGroupLeafOnly = {
  href: string;
  label: string;
  Icon: LucideIcon;
  isActive: (pathname: string) => boolean;
};

/** Sub-link under a nav group; optional `children` renders as an indented cluster below the parent row. */
type NavGroupSubLink = NavGroupLeafOnly & {
  children?: NavGroupLeafOnly[];
};

type NavGroupItem = {
  kind: "group";
  /** Stable key for expand/collapse state. */
  id: string;
  label: string;
  Icon: LucideIcon;
  items: NavGroupSubLink[];
};

type NavEntry = NavLinkItem | NavGroupItem;

function groupHasActiveChild(entry: NavGroupItem, pathname: string): boolean {
  return entry.items.some((item) => {
    if (item.isActive(pathname)) return true;
    return item.children?.some((c) => c.isActive(pathname)) ?? false;
  });
}

/** Flatten group items in the same order as expanded sub-nav rendering. */
function flatLeavesForNavGroup(entry: NavGroupItem): NavGroupLeafOnly[] {
  return entry.items.flatMap((sub) => {
    const parent: NavGroupLeafOnly = {
      href: sub.href,
      label: sub.label,
      Icon: sub.Icon,
      isActive: sub.isActive,
    };
    return sub.children?.length ? [parent, ...sub.children] : [parent];
  });
}

function primaryNavItemsForRole(role: SessionUserRole): NavEntry[] {
  const homeLabel = role === "admin" ? "Retirement homes" : "Your homes";

  const adminGroup: NavGroupItem = {
    kind: "group",
    id: "admin",
    label: "Admin",
    Icon: UserCog,
    items: [
      {
        href: "/dashboard/residents",
        label: "Residents",
        Icon: Users,
        isActive: isDashboardResidentsPath,
      },
      {
        href: "/dashboard/homes",
        label: homeLabel,
        Icon: Building2,
        isActive: isDashboardHomesPath,
      },
      {
        href: "/dashboard/tasks",
        label: "Tasks",
        Icon: ClipboardList,
        isActive: isDashboardTasksPath,
      },
    ],
  };

  const inventoryGroup: NavGroupItem = {
    kind: "group",
    id: "inventory",
    label: "Inventory",
    Icon: PackageSearch,
    items: [
      {
        href: "/dashboard/inventory-orders/catalog",
        label: "Inventory catalog",
        Icon: LayoutGrid,
        isActive: isDashboardInventoryCatalogPath,
      },
      {
        href: "/dashboard/inventory-orders",
        label: "Inventory orders",
        Icon: ShoppingCart,
        isActive: isDashboardInventoryOrdersPath,
      },
      {
        href: "/dashboard/inventory-orders/suppliers",
        label: "Suppliers",
        Icon: Building2,
        isActive: isDashboardInventorySuppliersPath,
      },
    ],
  };

  const items: NavEntry[] = [
    {
      kind: "link",
      href: "/dashboard",
      label: "Overview",
      Icon: LayoutDashboard,
      isActive: (p) => p === "/dashboard",
    },
  ];

  if (role === "admin") {
    items.push({
      kind: "group",
      id: "analytics",
      label: "Analytics",
      Icon: BarChart3,
      items: [
        {
          href: "/dashboard/analytics/occupancy",
          label: "Occupancy",
          Icon: Building2,
          isActive: isDashboardAnalyticsOccupancyPath,
        },
        {
          href: "/dashboard/analytics/financial",
          label: "Billing overview",
          Icon: BarChart3,
          isActive: isDashboardAnalyticsFinancialPath,
        },
        {
          href: "/dashboard/analytics/admissions-departures",
          label: "Admissions",
          Icon: DoorOpen,
          isActive: isDashboardAnalyticsAdmissionsDeparturesPath,
        },
        {
          href: "/dashboard/analytics/demographics-staff",
          label: "Demographics",
          Icon: PieChart,
          isActive: isDashboardAnalyticsDemographicsStaffPath,
        },
      ],
    });
  }

  items.push(adminGroup, inventoryGroup);

  if (role === "admin") {
    items.push(
      {
        kind: "group",
        id: "billing",
        label: "Billing",
        Icon: Receipt,
        items: [
          {
            href: "/dashboard/invoices",
            label: "Invoices",
            Icon: FileSpreadsheet,
            isActive: isDashboardInvoicesPath,
          },
          {
            href: "/dashboard/charges",
            label: "Resident charges",
            Icon: Receipt,
            isActive: isDashboardChargesPath,
          },
          {
            href: "/dashboard/home-expenses",
            label: "Home charges",
            Icon: Landmark,
            isActive: isDashboardHomeExpensesPath,
          },
        ],
      },
      {
        kind: "group",
        id: "ledger",
        label: "Ledger",
        Icon: BookOpen,
        items: [
          {
            href: "/dashboard/ledger",
            label: "Ledger",
            Icon: BookOpen,
            isActive: isDashboardLedgerPath,
          },
          {
            href: "/dashboard/home-payments",
            label: "Home payments",
            Icon: Banknote,
            isActive: isDashboardHomeAccountPaymentsPath,
          },
          {
            href: "/dashboard/payments",
            label: "Resident payments",
            Icon: Wallet,
            isActive: isDashboardPaymentsPath,
          },
        ],
      },
      {
        kind: "group",
        id: "organization",
        label: "Organization",
        Icon: Settings,
        items: [
          {
            href: "/dashboard/users",
            label: "Staff",
            Icon: UserCog,
            isActive: isDashboardUsersPath,
          },
          {
            href: "/dashboard/waiting-list",
            label: "Waiting list",
            Icon: Inbox,
            isActive: isDashboardWaitingListPath,
          },
          {
            href: "/dashboard/admin/settings",
            label: "Admin settings",
            Icon: Settings,
            isActive: isDashboardAdminSettingsPath,
          },
        ],
      },
    );
  }

  items.push({
    kind: "link",
    href: "/dashboard/account",
    label: "My account",
    Icon: UserCircle,
    isActive: isDashboardAccountPath,
  });

  return items;
}

type PrimaryNavProps = {
  pathname: string;
  role: SessionUserRole;
  onNavigate?: () => void;
  className?: string;
  "aria-label"?: string;
  navLinkLayout?: "horizontal" | "vertical";
  /** Narrow icon rail (`lg+` desktop only; always false for mobile drawer). */
  railCollapsed?: boolean;
};

function PrimaryNav({
  pathname,
  role,
  onNavigate,
  className,
  "aria-label": ariaLabel = "Main navigation",
  navLinkLayout = "vertical",
  railCollapsed = false,
}: PrimaryNavProps) {
  const items = useMemo(() => primaryNavItemsForRole(role), [role]);
  const iconRail = navLinkLayout === "vertical" && railCollapsed;
  const navPrefix = useId();

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const e of items) {
      if (e.kind === "group") init[e.id] = groupHasActiveChild(e, pathname);
    }
    return init;
  });

  useEffect(() => {
    setExpanded((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const e of items) {
        if (e.kind === "group" && groupHasActiveChild(e, pathname) && !next[e.id]) {
          next[e.id] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pathname, items]);

  const linkClass =
    navLinkLayout === "vertical"
      ? [
          "village-nav-link block w-full text-left",
          iconRail
            ? "village-nav-link--rail-collapsed flex items-center"
            : "flex items-center gap-2.5",
        ].join(" ")
      : "village-nav-link flex items-center gap-2";

  const subLinkClassCollapsed = [
    "village-nav-link block w-full min-w-0 text-left",
    iconRail
      ? "village-nav-link--rail-collapsed flex items-center"
      : "flex items-center gap-2.5 text-left",
  ].join(" ");

  const toggleGroup = useCallback((id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  return (
    <nav
      className={className}
      aria-label={ariaLabel}
      onClick={onNavigate}
    >
      <div
        className={
          navLinkLayout === "vertical"
            ? "village-nav-cluster-animate flex flex-col gap-1"
            : "village-nav-cluster village-nav-cluster-animate"
        }
      >
        {items.map((entry) => {
          if (entry.kind === "group") {
            const flatLeaves = flatLeavesForNavGroup(entry);

            if (navLinkLayout === "vertical" && iconRail) {
              const first = flatLeaves[0];
              if (!first) return null;
              const active = groupHasActiveChild(entry, pathname);
              const GroupIcon = entry.Icon;
              return (
                <Link
                  key={entry.id}
                  href={first.href}
                  className={linkClass}
                  aria-current={active ? "page" : undefined}
                  aria-label={entry.label}
                  title={entry.label}
                >
                  <GroupIcon
                    className="shrink-0"
                    size={20}
                    strokeWidth={active ? 2.25 : 2}
                    aria-hidden
                  />
                </Link>
              );
            }

            if (navLinkLayout !== "vertical") {
              return (
                <Fragment key={entry.id}>
                  {flatLeaves.map((leaf) => {
                    const active = leaf.isActive(pathname);
                    return (
                      <Link
                        key={leaf.href}
                        href={leaf.href}
                        className={linkClass}
                        aria-current={active ? "page" : undefined}
                      >
                        <leaf.Icon
                          className="shrink-0"
                          size={18}
                          strokeWidth={active ? 2.25 : 2}
                          aria-hidden
                        />
                        <span className="min-w-0 leading-snug">{leaf.label}</span>
                      </Link>
                    );
                  })}
                </Fragment>
              );
            }

            const isOpen = expanded[entry.id] === true;
            const groupActive = groupHasActiveChild(entry, pathname);
            const panelId = `${navPrefix}-${entry.id}`;
            const GroupIcon = entry.Icon;

            const nestedBlocks = entry.items.flatMap((sub) => {
              const rows: { link: NavGroupLeafOnly; nested: boolean }[] = [
                { link: sub as NavGroupLeafOnly, nested: false },
              ];
              if (sub.children?.length) {
                for (const c of sub.children) {
                  rows.push({ link: c, nested: true });
                }
              }
              return rows;
            });

            return (
              <div
                key={entry.id}
                className="flex flex-col gap-0.5"
              >
                <button
                  type="button"
                  className={[
                    "village-nav-link village-nav-group-toggle flex w-full cursor-pointer items-center gap-2 rounded-md border-none bg-transparent text-left outline-none",
                    "focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color-mix(in_srgb,var(--bg-canvas)_86%,var(--accent)_7%)]",
                    isOpen || groupActive
                      ? "bg-[color:color-mix(in_srgb,var(--accent)_14%,var(--bg-canvas)_86%)] text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)]",
                  ].join(" ")}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleGroup(entry.id);
                  }}
                >
                  <GroupIcon
                    className="shrink-0 opacity-90"
                    size={18}
                    strokeWidth={2}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 text-[0.875rem] font-medium leading-snug">
                    {entry.label}
                  </span>
                  <ChevronRight
                    className={[
                      "shrink-0 opacity-75 transition-transform duration-150 ease-out motion-reduce:transition-none",
                      isOpen ? "rotate-90" : "",
                    ].join(" ")}
                    size={16}
                    strokeWidth={2}
                    aria-hidden
                  />
                </button>
                {isOpen ? (
                  <div
                    id={panelId}
                    className="ml-[1.125rem] flex min-w-0 flex-col gap-0.5 border-l border-[color:color-mix(in_srgb,var(--line-subtle)_55%,var(--accent)_10%)] pl-3"
                  >
                    {nestedBlocks.map(({ link: leaf, nested }) => {
                      const active = leaf.isActive(pathname);
                      const nestedCls = nested ? "text-[0.9375rem]" : "";
                      return (
                        <Link
                          key={
                            nested ? `${leaf.href}__nested` : leaf.href
                          }
                          href={leaf.href}
                          className={[subLinkClassCollapsed, nestedCls].filter(Boolean).join(" ")}
                          aria-current={active ? "page" : undefined}
                        >
                          <leaf.Icon
                            className="shrink-0"
                            size={18}
                            strokeWidth={active ? 2.15 : 2}
                            aria-hidden
                          />
                          <span className="min-w-0 leading-snug">{leaf.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          }

          const { href, label, Icon, isActive } = entry;
          const active = isActive(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={linkClass}
              aria-current={active ? "page" : undefined}
              aria-label={iconRail ? label : undefined}
              title={iconRail ? label : undefined}
            >
              <Icon
                className="shrink-0"
                size={iconRail ? 20 : 18}
                strokeWidth={active && iconRail ? 2.25 : 2}
                aria-hidden
              />
              {iconRail ? null : <span>{label}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

type BrandLockupProps = {
  collapsed?: boolean;
  className?: string;
};

function BrandLockup({ collapsed, className }: BrandLockupProps) {
  return (
    <Link
      href="/dashboard"
      className={[
        "village-brand-lockup group shrink-0 outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--accent)_50%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color-mix(in_srgb,var(--bg-canvas)_86%,var(--accent)_7%)]",
        collapsed
          ? "!mb-0 !gap-0 !px-0 !py-0 [&_.village-brand-mark]:h-10 [&_.village-brand-mark]:w-10"
          : "mb-2",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="village-brand-mark" aria-hidden="true">
        V60
      </span>
      {collapsed ? (
        <span className="sr-only">Village60, retirement operations</span>
      ) : (
        <span className="min-w-0">
          <span className="village-brand-wordmark block">Village60</span>
          <span className="village-brand-tagline mt-1 block transition-colors">
            Retirement operations
          </span>
        </span>
      )}
    </Link>
  );
}

export function DashboardAppShell({
  email,
  role,
  children,
}: DashboardAppShellProps) {
  const pathname = usePathname() ?? "";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [railExpanded, setRailExpanded] = useState(true);
  const menuId = useId();
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const { activeBreadcrumbs } = useDashboardWayfinding();
  const contextTitle = getDashboardContextTitle(pathname, role);
  const useCrumbs =
    activeBreadcrumbs && activeBreadcrumbs.length > 0
      ? activeBreadcrumbs
      : null;

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
  }, []);

  const openMobile = useCallback(() => {
    setMobileOpen(true);
  }, []);

  useEffect(() => {
    let frame = 0;
    try {
      const raw = localStorage.getItem(DASHBOARD_SIDEBAR_EXPANDED_KEY);
      frame = window.requestAnimationFrame(() => {
        setRailExpanded(readSidebarExpandedFromStorage(raw));
      });
    } catch {
      /* ignore */
    }
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const toggleRailExpanded = useCallback(() => {
    setRailExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(
          DASHBOARD_SIDEBAR_EXPANDED_KEY,
          writeSidebarExpandedToStorage(next),
        );
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!mobileOpen) {
      if (menuButtonRef.current) {
        menuButtonRef.current.tabIndex = 0;
      }
      return;
    }
    if (menuButtonRef.current) {
      menuButtonRef.current.tabIndex = -1;
    }
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const panel = mobilePanelRef.current;
    if (!panel) return;
    const t = window.setTimeout(() => {
      const f = focusableIn(panel);
      f[0]?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !mobilePanelRef.current) return;
      const panel = mobilePanelRef.current;
      const focusables = focusableIn(panel);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const act = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (act === first || !panel.contains(act)) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (act === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMobile();
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [mobileOpen, closeMobile]);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      setMobileOpen(false);
    });
    return () => window.cancelAnimationFrame(id);
  }, [pathname]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (mq.matches) setMobileOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const shellPadClass = railExpanded ? "lg:pl-[260px]" : "lg:pl-[4.5rem]";
  const asideWidthClass = railExpanded ? "w-[260px]" : "w-[4.5rem]";
  const asidePadClass = railExpanded ? "p-4 pt-5" : "px-2 py-5 pt-5";

  return (
    <>
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      <a
        href={`#${MAIN_ID}`}
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded-lg focus:border focus:border-[var(--line-strong)] focus:bg-[var(--bg-elevated)] focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-[var(--text-primary)] focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]"
      >
        Skip to main content
      </a>
      <div
        className={[
          "relative min-h-screen transition-[padding] duration-150 ease-out motion-reduce:transition-none",
          shellPadClass,
        ].join(" ")}
      >
        <aside
          className={[
            "village-dashboard-shell-rail group fixed inset-y-0 left-0 z-20 hidden flex-col border-r border-[color:color-mix(in_srgb,var(--line-subtle)_72%,var(--accent)_10%)] shadow-none transition-[width,padding] duration-150 ease-out motion-reduce:transition-none lg:flex",
            asideWidthClass,
            asidePadClass,
          ].join(" ")}
          aria-label="Primary"
        >
          <div
            className={[
              "mb-2 flex min-w-0 gap-1.5",
              railExpanded ? "items-start" : "flex-col items-center",
            ].join(" ")}
          >
            <button
              type="button"
              onClick={toggleRailExpanded}
              aria-pressed={railExpanded}
              aria-label={
                railExpanded
                  ? "Collapse navigation rail"
                  : "Expand navigation rail"
              }
              className={[
                "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_68%,var(--accent)_12%)] bg-[color:color-mix(in_srgb,var(--bg-canvas)_88%,var(--accent)_4%)] text-[var(--text-primary)] transition hover:border-[color:color-mix(in_srgb,var(--accent)_40%,var(--line-strong)_60%)] hover:bg-[color:color-mix(in_srgb,var(--bg-canvas)_78%,var(--accent)_8%)] focus-visible:outline focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]",
                railExpanded ? "mt-1" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {railExpanded ? (
                <PanelLeftClose size={20} strokeWidth={2} aria-hidden />
              ) : (
                <PanelLeft size={20} strokeWidth={2} aria-hidden />
              )}
            </button>
            <BrandLockup
              collapsed={!railExpanded}
              className={railExpanded ? "min-w-0 flex-1" : ""}
            />
          </div>
          <PrimaryNav
            pathname={pathname}
            role={role}
            className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain"
            railCollapsed={!railExpanded}
          />
        </aside>
        {mobileOpen ? (
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-40 cursor-default bg-[color:color-mix(in_srgb,var(--bg-canvas)_56%,var(--text-primary)_44%)] lg:hidden"
            onClick={() => {
              closeMobile();
              window.setTimeout(() => menuButtonRef.current?.focus(), 0);
            }}
          />
        ) : null}
        {mobileOpen ? (
          <div
            ref={mobilePanelRef}
            className="village-dashboard-shell-rail fixed inset-y-0 left-0 z-50 flex w-[min(100vw,20rem)] flex-col border-r border-[color:color-mix(in_srgb,var(--line-subtle)_72%,var(--accent)_10%)] p-4 pt-5 shadow-none lg:hidden"
            id={menuId}
            role="dialog"
            aria-modal="true"
            aria-label="Main navigation"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="font-display text-lg font-semibold text-[var(--text-primary)]">
                Menu
              </span>
              <button
                type="button"
                className="rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_65%,var(--accent)_15%)] bg-[color:color-mix(in_srgb,var(--bg-canvas)_90%,var(--accent)_4%)] px-2.5 py-1 text-sm font-semibold text-[var(--text-secondary)] hover:border-[color:color-mix(in_srgb,var(--accent)_45%,var(--line-strong)_55%)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]"
                onClick={() => {
                  closeMobile();
                  menuButtonRef.current?.focus();
                }}
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <PrimaryNav
                pathname={pathname}
                role={role}
                onNavigate={closeMobile}
                aria-label="Main navigation"
                railCollapsed={false}
              />
            </div>
          </div>
        ) : null}
        <div className="village-app-bg flex min-h-screen min-w-0 flex-col">
          <header
            role="banner"
            className="village-dashboard-topbar village-dashboard-topbar-animate sticky top-0 z-30 border-b border-[color:color-mix(in_srgb,var(--line-subtle)_78%,transparent)] shadow-[0_10px_30px_-28px_color-mix(in_srgb,var(--accent-strong)_58%,transparent)] backdrop-blur supports-[backdrop-filter]:bg-[color:color-mix(in_srgb,var(--bg-elevated)_82%,transparent)]"
          >
            <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
              <button
                ref={menuButtonRef}
                type="button"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] text-[var(--text-primary)] shadow-sm hover:border-[color:color-mix(in_srgb,var(--accent)_56%,transparent)] focus-visible:outline focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)] lg:hidden"
                aria-label="Open main menu"
                aria-expanded={mobileOpen}
                aria-controls={menuId}
                onClick={() => {
                  if (mobileOpen) {
                    closeMobile();
                    window.setTimeout(() => menuButtonRef.current?.focus(), 0);
                  } else {
                    openMobile();
                  }
                }}
              >
                <span className="sr-only">Menu</span>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div
                className="flex min-w-0 flex-1 items-center gap-3"
                inert={mobileOpen ? true : undefined}
              >
                <div className="min-w-0 flex-1">
                  {useCrumbs ? (
                    <DashboardBreadcrumbNav crumbs={useCrumbs} />
                  ) : (
                    <h1
                      className="truncate font-display text-lg font-semibold text-[var(--text-primary)] sm:text-xl"
                      id="village-dashboard-context-title"
                    >
                      {contextTitle}
                    </h1>
                  )}
                </div>
                <div className="village-session-cluster !m-0 shrink-0 !border-0 !p-0">
                  <p className="village-session-pill">
                    <strong>{email}</strong>
                    <span className="text-[color:color-mix(in_srgb,var(--text-secondary)_60%,transparent)]"> / </span>
                    <span className="village-session-role uppercase tracking-wide">
                      {role}
                    </span>
                  </p>
                  <LogoutButton className="village-logout-chip shrink-0" />
                </div>
              </div>
            </div>
          </header>
          <div
            className="village-dashboard-main mx-auto w-full max-w-7xl flex-1 px-4 pb-14 pt-8 sm:px-6 lg:px-8"
            inert={mobileOpen ? true : undefined}
          >
            <main id={MAIN_ID} tabIndex={-1} className="village-reveal outline-none">
              {children}
            </main>
          </div>
        </div>
      </div>
    </>
  );
}

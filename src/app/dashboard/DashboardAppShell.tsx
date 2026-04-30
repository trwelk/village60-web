"use client";

import type { NavCrumb } from "@/lib/dashboard/nestedBreadcrumbs";
import type { SessionUserRole } from "@/lib/session";
import { getDashboardContextTitle } from "@/lib/dashboard/contextTitle";
import { useDashboardWayfinding } from "./DashboardWayfinding";
import {
  isDashboardAnalyticsPath,
  isDashboardAccountPath,
  isDashboardChargesPath,
  isDashboardHomesPath,
  isDashboardOtherChargesPath,
  isDashboardPaymentsPath,
  isDashboardResidentsPath,
  isDashboardTasksPath,
  isDashboardUsersPath,
} from "@/lib/dashboard/dashboardPaths";
import {
  DASHBOARD_SIDEBAR_EXPANDED_KEY,
  readSidebarExpandedFromStorage,
  writeSidebarExpandedToStorage,
} from "@/lib/dashboard/sidebarExpandedStorage";
import type { LucideIcon } from "lucide-react";
import {
  BarChart2,
  Building2,
  ClipboardList,
  FileStack,
  LayoutDashboard,
  PanelLeft,
  PanelLeftClose,
  Receipt,
  UserCircle,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { LogoutButton } from "./LogoutButton";

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

type NavItem = {
  href: string;
  label: string;
  Icon: LucideIcon;
  isActive: (pathname: string) => boolean;
};

function primaryNavItemsForRole(role: SessionUserRole): NavItem[] {
  const items: NavItem[] = [
    {
      href: "/dashboard",
      label: "Overview",
      Icon: LayoutDashboard,
      isActive: (p) => p === "/dashboard",
    },
    ...(role === "admin"
      ? [
          {
            href: "/dashboard/analytics",
            label: "Analytics",
            Icon: BarChart2,
            isActive: isDashboardAnalyticsPath,
          } satisfies NavItem,
        ]
      : []),
    {
      href: "/dashboard/account",
      label: "My account",
      Icon: UserCircle,
      isActive: isDashboardAccountPath,
    },
    {
      href: "/dashboard/residents",
      label: "Residents",
      Icon: Users,
      isActive: isDashboardResidentsPath,
    },
    {
      href: "/dashboard/tasks",
      label: "Tasks",
      Icon: ClipboardList,
      isActive: isDashboardTasksPath,
    },
    {
      href: "/dashboard/homes",
      label: role === "admin" ? "Retirement homes" : "Your homes",
      Icon: Building2,
      isActive: isDashboardHomesPath,
    },
  ];
  if (role === "admin") {
    items.push(
      {
        href: "/dashboard/charges",
        label: "Charges",
        Icon: Receipt,
        isActive: isDashboardChargesPath,
      },
      {
        href: "/dashboard/other-charges",
        label: "Other charges",
        Icon: FileStack,
        isActive: isDashboardOtherChargesPath,
      },
      {
        href: "/dashboard/payments",
        label: "Payments",
        Icon: Wallet,
        isActive: isDashboardPaymentsPath,
      },
      {
        href: "/dashboard/users",
        label: "Staff",
        Icon: UserCog,
        isActive: isDashboardUsersPath,
      },
    );
  }
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
  const items = primaryNavItemsForRole(role);
  const iconRail = navLinkLayout === "vertical" && railCollapsed;
  const linkClass =
    navLinkLayout === "vertical"
      ? [
          "village-nav-link block w-full text-left",
          iconRail
            ? "village-nav-link--rail-collapsed flex items-center"
            : "flex items-center gap-2.5",
        ].join(" ")
      : "village-nav-link flex items-center gap-2";

  return (
    <nav
      className={className}
      aria-label={ariaLabel}
      onClick={onNavigate}
    >
      <div
        className={
          navLinkLayout === "vertical"
            ? "village-nav-cluster-animate flex flex-col gap-0.5 rounded-2xl p-1.5 shadow-inner shadow-[color:color-mix(in_srgb,var(--accent)_12%,transparent)] backdrop-blur"
            : "village-nav-cluster village-nav-cluster-animate"
        }
      >
        {items.map(({ href, label, Icon, isActive }) => {
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
        "village-brand-lockup group shrink-0 outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--accent)_50%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-canvas)]",
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
          <span className="village-brand-tagline mt-1 block transition-colors group-hover:text-[color:color-mix(in_srgb,var(--highlight)_85%,var(--text-muted)_15%)]">
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
    try {
      const raw = localStorage.getItem(DASHBOARD_SIDEBAR_EXPANDED_KEY);
      setRailExpanded(readSidebarExpandedFromStorage(raw));
    } catch {
      /* ignore */
    }
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
      <a
        href={`#${MAIN_ID}`}
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded-lg focus:border focus:border-[var(--line-strong)] focus:bg-[var(--bg-elevated)] focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-[var(--text-primary)] focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]"
      >
        Skip to main content
      </a>
      <div
        className={[
          "relative min-h-screen transition-[padding] duration-200 ease-out",
          shellPadClass,
        ].join(" ")}
      >
        <aside
          className={[
            "village-dashboard-shell-rail group fixed inset-y-0 left-0 z-20 hidden flex-col border-r border-[color:color-mix(in_srgb,var(--line-subtle)_75%,transparent)] shadow-[var(--shadow-md)] backdrop-blur transition-[width] duration-200 ease-out lg:flex",
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
                "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_94%,transparent)] text-[var(--text-primary)] shadow-sm transition hover:border-[color:color-mix(in_srgb,var(--accent)_56%,transparent)] focus-visible:outline focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]",
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
            className="min-h-0 flex-1"
            railCollapsed={!railExpanded}
          />
        </aside>
        {mobileOpen ? (
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-40 cursor-default bg-[color:color-mix(in_srgb,var(--bg-canvas)_56%,black_44%)] lg:hidden"
            onClick={() => {
              closeMobile();
              window.setTimeout(() => menuButtonRef.current?.focus(), 0);
            }}
          />
        ) : null}
        {mobileOpen ? (
          <div
            ref={mobilePanelRef}
            className="village-dashboard-shell-rail fixed inset-y-0 left-0 z-50 flex w-[min(100vw,20rem)] flex-col border-r border-[color:color-mix(in_srgb,var(--line-strong)_66%,transparent)] p-4 pt-5 shadow-[var(--shadow-lg)] backdrop-blur lg:hidden"
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
                className="rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_65%,transparent)] px-2.5 py-1 text-sm font-semibold text-[var(--text-secondary)] hover:border-[color:color-mix(in_srgb,var(--accent)_54%,transparent)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]"
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
        <div className="flex min-h-screen min-w-0 flex-col">
          <header
            role="banner"
            className="village-dashboard-topbar village-dashboard-topbar-animate sticky top-0 z-30 border-b border-[color:color-mix(in_srgb,var(--line-subtle)_78%,transparent)] shadow-sm shadow-[color:color-mix(in_srgb,var(--accent)_12%,transparent)] backdrop-blur supports-[backdrop-filter]:bg-[color:color-mix(in_srgb,var(--bg-elevated)_82%,transparent)]"
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

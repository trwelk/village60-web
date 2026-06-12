import Link from "next/link";
import { Cake, ChevronRight } from "lucide-react";
import type { DashboardBirthdayEntry } from "@/lib/dashboard/birthdays";
import { dashboardResidentHref } from "@/lib/dashboard/dashboardRoutes";

type DashboardTodayBirthdaysBannerProps = {
  entries: DashboardBirthdayEntry[];
};

export function DashboardTodayBirthdaysBanner({
  entries,
}: DashboardTodayBirthdaysBannerProps) {
  if (entries.length === 0) {
    return null;
  }

  const headline =
    entries.length === 1
      ? "Birthday today"
      : `${entries.length} birthdays today`;

  return (
    <aside
      className="village-panel-card village-reveal overflow-hidden border-[color-mix(in_srgb,var(--highlight)_35%,var(--line-subtle))] bg-[color-mix(in_srgb,var(--highlight)_8%,var(--bg-elevated))] p-0 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--bg-elevated)_78%,transparent)]"
      aria-labelledby="today-birthdays-banner-heading"
    >
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:gap-5 sm:p-5">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--accent)_18%,var(--bg-elevated))] text-[var(--accent-strong)] shadow-[inset_0_1px_0_color-mix(in_srgb,var(--bg-elevated)_72%,transparent)]"
          aria-hidden
        >
          <Cake className="h-6 w-6" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id="today-birthdays-banner-heading"
            className="font-display text-lg font-normal tracking-tight text-[var(--text-primary)] sm:text-xl"
          >
            {headline}
          </h2>
          <p className="village-muted mt-1 text-sm leading-relaxed">
            Same UTC calendar day as task reminders — celebrate and check care
            notes if needed.
          </p>
          <ul className="mt-4 space-y-2">
            {entries.map((row) => (
              <li key={row.residentId}>
                <Link
                  href={dashboardResidentHref(row.residentId)}
                  className="group village-lift flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-xl border border-[color-mix(in_srgb,var(--accent)_14%,var(--line-subtle))] bg-[color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] px-3 py-2.5 text-sm no-underline transition sm:flex-nowrap sm:justify-between"
                >
                  <span className="inline-flex min-w-0 items-center gap-1 font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-strong)]">
                    <span className="truncate">{row.residentName}</span>
                    <span className="shrink-0 font-normal text-[var(--text-secondary)]">
                      · turns {row.ageTurning}
                    </span>
                    <ChevronRight
                      className="h-3.5 w-3.5 shrink-0 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100"
                      aria-hidden
                      strokeWidth={2.5}
                    />
                  </span>
                  <span className="text-xs text-[var(--text-muted)] sm:text-sm">
                    {row.homeName}
                    {row.wardLabel ? (
                      <span className="text-ink/55"> — {row.wardLabel}</span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}

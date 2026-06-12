"use client";

import Link from "next/link";
import { CalendarHeart, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { DashboardBirthdayEntry } from "@/lib/dashboard/birthdays";
import { dashboardResidentHref } from "@/lib/dashboard/dashboardRoutes";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { translateWith } from "@/lib/i18n/messages";

type ResidentBirthdayBoardCardProps = {
  week: DashboardBirthdayEntry[];
  month: DashboardBirthdayEntry[];
  asOfLabel: string;
};

function formatDisplayDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(dt);
}

export function ResidentBirthdayBoardCard({
  week,
  month,
  asOfLabel,
}: ResidentBirthdayBoardCardProps) {
  const { t, locale } = useI18n();
  const [range, setRange] = useState<"week" | "month">("week");
  const items = range === "week" ? week : month;
  const rangeLabel =
    range === "week" ? t("birthday.rangeThisWeek") : t("birthday.rangeThisMonth");

  return (
    <section
      id="resident-birthday-board"
      className="village-panel-card village-reveal p-5 sm:p-6"
      aria-labelledby="birthday-board-heading"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h2
            id="birthday-board-heading"
            className="font-display text-xl font-normal tracking-tight text-[var(--text-primary)] sm:text-[1.35rem]"
          >
            {t("birthday.boardTitle")}
          </h2>
          <p className="village-muted mt-2 max-w-2xl text-sm leading-relaxed">
            {translateWith(locale, "birthday.boardHint", { date: asOfLabel })}
          </p>
        </div>
        <div
          className="flex shrink-0 rounded-[999px] border border-[color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[color-mix(in_srgb,var(--bg-muted)_42%,var(--bg-elevated))] p-1 shadow-[inset_0_1px_2px_color-mix(in_srgb,var(--text-primary)_6%,transparent)]"
          role="group"
          aria-label={t("filters.timeRange")}
        >
          <button
            type="button"
            aria-pressed={range === "week"}
            onClick={() => setRange("week")}
            className={
              range === "week"
                ? "rounded-full bg-[color-mix(in_srgb,var(--partner-green)_22%,var(--bg-elevated))] px-4 py-2 text-xs font-semibold text-[var(--text-primary)] shadow-[0_1px_2px_color-mix(in_srgb,var(--text-primary)_12%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--partner-green)_38%,transparent)]"
                : "rounded-full px-4 py-2 text-xs font-medium text-[var(--text-muted)] transition hover:bg-[color-mix(in_srgb,var(--bg-elevated)_55%,transparent)] hover:text-[var(--text-secondary)]"
            }
          >
            {t("birthday.thisWeek")}
          </button>
          <button
            type="button"
            aria-pressed={range === "month"}
            onClick={() => setRange("month")}
            className={
              range === "month"
                ? "rounded-full bg-[color-mix(in_srgb,var(--partner-green)_22%,var(--bg-elevated))] px-4 py-2 text-xs font-semibold text-[var(--text-primary)] shadow-[0_1px_2px_color-mix(in_srgb,var(--text-primary)_12%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--partner-green)_38%,transparent)]"
                : "rounded-full px-4 py-2 text-xs font-medium text-[var(--text-muted)] transition hover:bg-[color-mix(in_srgb,var(--bg-elevated)_55%,transparent)] hover:text-[var(--text-secondary)]"
            }
          >
            {t("birthday.thisMonth")}
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[color-mix(in_srgb,var(--accent)_28%,var(--line-subtle))] bg-[color-mix(in_srgb,var(--accent)_5%,var(--bg-elevated))] px-6 py-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--highlight)_24%,var(--bg-elevated))] text-[var(--accent-strong)] shadow-[inset_0_1px_0_color-mix(in_srgb,var(--bg-elevated)_70%,transparent)]">
            <CalendarHeart className="h-7 w-7" strokeWidth={1.75} aria-hidden />
          </div>
          <p className="mt-5 text-[0.95rem] font-medium text-[var(--text-primary)]">
            {translateWith(locale, "birthday.noBirthdaysScheduled", {
              range: rangeLabel,
            })}
          </p>
          <p className="village-muted mx-auto mt-2 max-w-md text-sm leading-relaxed">
            {t("birthday.noBirthdaysHint")}{" "}
            <Link
              href="/dashboard/residents"
              className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:underline"
            >
              {t("birthday.residentProfiles")}
            </Link>
            .
          </p>
        </div>
      ) : (
        <ul
          className={`mt-5 space-y-3 ${range === "month" ? "max-h-[min(24rem,70vh)] overflow-y-auto pr-1" : ""}`}
        >
          {items.map((row) => (
            <li key={`${row.residentId}-${row.birthdayDate}`}>
              <Link
                href={dashboardResidentHref(row.residentId)}
                className="village-lift group flex flex-col gap-1.5 rounded-2xl border border-[color:color-mix(in_srgb,var(--accent)_12%,var(--line-subtle))] bg-[color-mix(in_srgb,var(--bg-elevated)_82%,transparent)] px-4 py-3.5 no-underline transition duration-200"
              >
                <div className="flex min-w-0 items-baseline justify-between gap-3">
                  <span className="inline-flex min-w-0 items-center gap-1 text-[0.95rem] font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-strong)]">
                    <span className="truncate">{row.residentName}</span>
                    <ChevronRight
                      className="h-3.5 w-3.5 shrink-0 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100"
                      aria-hidden
                      strokeWidth={2.5}
                    />
                  </span>
                  <time
                    dateTime={row.birthdayDate}
                    className="shrink-0 text-sm font-medium tabular-nums text-ink/85"
                  >
                    {formatDisplayDate(row.birthdayDate)}
                  </time>
                </div>
                <div className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
                  <span className="village-muted shrink-0">
                    {translateWith(locale, "birthday.turnsAge", {
                      age: row.ageTurning,
                    })}
                  </span>
                  <span className="village-muted min-w-0 truncate text-right">
                    {row.homeName}
                    {row.wardLabel ? (
                      <span className="text-ink/55"> — {row.wardLabel}</span>
                    ) : null}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-[color-mix(in_srgb,var(--line-subtle)_65%,transparent)] pt-4">
        <p className="text-xs text-[var(--text-muted)]">
          {t("birthday.tasksFooter")}{" "}
          <Link
            href="/dashboard/tasks?status=open&type=birthday"
            className="font-medium text-pine-2 underline-offset-2 hover:underline"
          >
            {t("nav.tasks")}
          </Link>{" "}
          {t("birthday.tasksWindow")}
        </p>
      </div>
    </section>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import type { DashboardBirthdayEntry } from "@/lib/dashboard/birthdays";

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
  const [range, setRange] = useState<"week" | "month">("week");
  const items = range === "week" ? week : month;
  const rangeLabel = range === "week" ? "this week" : "this month";

  return (
    <section
      className="village-panel-card village-reveal p-5 sm:p-6"
      aria-labelledby="birthday-board-heading"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h2
            id="birthday-board-heading"
            className="font-display text-lg font-normal tracking-tight text-pine-2 sm:text-xl"
          >
            Resident birthday board
          </h2>
          <p className="village-muted mt-2 max-w-2xl text-sm leading-relaxed">
            Upcoming celebrations — name, age turning, and home or ward. Calendar
            day is UTC (same as task reminders) — as of {asOfLabel}.
          </p>
        </div>
        <div
          className="flex shrink-0 rounded-full border border-pine/10 bg-cream/80 p-1 shadow-inner shadow-pine/[0.04]"
          role="group"
          aria-label="Time range"
        >
          <button
            type="button"
            onClick={() => setRange("week")}
            className={
              range === "week"
                ? "rounded-full bg-[color:color-mix(in_srgb,var(--accent)_14%,var(--bg-elevated))] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] shadow-sm"
                : "rounded-full px-3.5 py-2 text-xs font-medium text-ink/55 transition hover:text-pine-2"
            }
          >
            This week
          </button>
          <button
            type="button"
            onClick={() => setRange("month")}
            className={
              range === "month"
                ? "rounded-full bg-[color:color-mix(in_srgb,var(--accent)_14%,var(--bg-elevated))] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] shadow-sm"
                : "rounded-full px-3.5 py-2 text-xs font-medium text-ink/55 transition hover:text-pine-2"
            }
          >
            This month
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="village-muted mt-5 text-sm leading-relaxed">
          No birthdays scheduled {rangeLabel}. Check back as the week rolls
          forward — or add date of birth on resident profiles.
        </p>
      ) : (
        <ul
          className={`mt-5 space-y-3 ${range === "month" ? "max-h-[min(24rem,70vh)] overflow-y-auto pr-1" : ""}`}
        >
          {items.map((row) => (
            <li key={`${row.residentId}-${row.birthdayDate}`}>
              <Link
                href={`/dashboard/homes/${row.homeId}/residents/${row.residentId}`}
                className="village-lift group flex flex-col gap-1 rounded-2xl border border-[color:color-mix(in_srgb,var(--accent)_8%,var(--line-subtle))] bg-[color:color-mix(in_srgb,var(--bg-elevated)_75%,transparent)] px-4 py-3.5 no-underline transition duration-200 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
              >
                <div className="min-w-0">
                  <span className="text-[0.95rem] font-semibold text-ink group-hover:text-pine-2">
                    {row.residentName}
                  </span>
                  <span className="village-muted text-sm"> · turns {row.ageTurning}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm sm:justify-end">
                  <time
                    dateTime={row.birthdayDate}
                    className="shrink-0 font-medium tabular-nums text-ink/85"
                  >
                    {formatDisplayDate(row.birthdayDate)}
                  </time>
                  <span className="village-muted hidden sm:inline" aria-hidden>
                    ·
                  </span>
                  <span className="village-muted min-w-0 truncate text-sm sm:text-right">
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

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-pine/8 pt-4">
        <p className="text-xs text-ink/50">
          Birthdays also appear in{" "}
          <Link
            href="/dashboard/tasks?status=open&type=birthday"
            className="font-medium text-pine-2 underline-offset-2 hover:underline"
          >
            Tasks
          </Link>{" "}
          (7-day window).
        </p>
      </div>
    </section>
  );
}

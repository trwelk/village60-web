"use client";

import Link from "next/link";
import {
  AlertTriangle,
  BedDouble,
  Cake,
  ClipboardList,
  ChevronRight,
} from "lucide-react";
import { displayFirstNameFromEmail } from "@/lib/dashboard/snapshotBriefing";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { TasksDashboardSummary } from "@/lib/tasks/service";
import { DashboardAttentionStrip } from "./DashboardAttentionStrip";
import { DashboardBriefingLead } from "./DashboardBriefingLead";
import { DashboardSnapshotSummary } from "./DashboardSnapshotSummary";

type DashboardTasksSnapshotProps = {
  summary: TasksDashboardSummary;
  occupancyPercent: number | null;
  isAdmin: boolean;
  email?: string | null;
  weekdayUtcLong: string;
};

function metricLinkClass(extra: string) {
  return [
    "village-lift group relative flex gap-3.5 rounded-2xl border p-4 no-underline transition-colors duration-200",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_42%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-elevated)]",
    extra,
  ].join(" ");
}

function metricStaticClass(extra: string) {
  return [
    "relative flex gap-3.5 rounded-2xl border p-4 transition-colors duration-200",
    extra,
  ].join(" ");
}

export function DashboardTasksSnapshot({
  summary,
  occupancyPercent,
  isAdmin,
  email,
  weekdayUtcLong,
}: DashboardTasksSnapshotProps) {
  const { t } = useI18n();
  const payAttention = summary.overduePayments > 0;
  const tasksAttention = summary.manualDueOrOverdue > 0;
  const firstName = displayFirstNameFromEmail(email);

  return (
    <section
      className="village-panel-card village-reveal overflow-hidden p-0"
      aria-labelledby="dashboard-tasks-snapshot-heading"
    >
      <div
        className="h-1 bg-gradient-to-r from-[var(--accent)] via-[var(--highlight)] to-[var(--partner-green)]"
        aria-hidden
      />
      <div className="flex flex-col gap-6 p-5 sm:p-6">
        <header className="flex flex-col gap-4">
          <DashboardBriefingLead
            firstName={firstName}
            weekdayUtcLong={weekdayUtcLong}
          />
          <DashboardSnapshotSummary
            summary={summary}
            occupancyPercent={occupancyPercent}
            isAdmin={isAdmin}
          />
          <DashboardAttentionStrip
            overduePayments={summary.overduePayments}
            manualDueOrOverdue={summary.manualDueOrOverdue}
          />
        </header>

        <div className="flex flex-col gap-6 border-t border-[color-mix(in_srgb,var(--line-subtle)_65%,transparent)] pt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2
              id="dashboard-tasks-snapshot-heading"
              className="font-display text-xl font-normal tracking-tight text-[var(--text-primary)] sm:text-[1.35rem]"
            >
              {t("sections.tasksReminders")}
            </h2>
            <p className="village-muted mt-2 max-w-xl text-sm leading-relaxed">
              {t("dashboard.tasksRemindersHint")}
            </p>
          </div>
          <Link
            href="/dashboard/tasks"
            className="village-btn-primary inline-flex min-h-10 shrink-0 items-center gap-1.5 self-start no-underline sm:self-center"
          >
            {t("buttons.viewAllTasks")}
            <ChevronRight className="h-4 w-4 opacity-90" aria-hidden strokeWidth={2.25} />
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/dashboard/tasks?status=open&type=manual"
            className={metricLinkClass(
              tasksAttention
                ? "border-[color-mix(in_srgb,var(--accent)_38%,var(--line-subtle))] bg-[color-mix(in_srgb,var(--accent)_7%,var(--bg-elevated))] shadow-[inset_0_1px_0_color-mix(in_srgb,var(--bg-elevated)_78%,transparent)]"
                : "border-[color:color-mix(in_srgb,var(--line-subtle)_76%,transparent)] bg-[color-mix(in_srgb,var(--bg-elevated)_88%,transparent)] shadow-[inset_0_1px_0_color-mix(in_srgb,var(--bg-elevated)_72%,transparent)]",
            )}
          >
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_16%,var(--bg-elevated))] text-[var(--accent-strong)]"
              aria-hidden
            >
              <ClipboardList className="h-5 w-5" strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-start justify-between gap-2">
                <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  {t("dashboard.tasksDueOverdue")}
                </span>
                <ChevronRight
                  className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)] opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100"
                  aria-hidden
                  strokeWidth={2}
                />
              </span>
              <span className="mt-1 block font-display text-[1.65rem] font-normal tabular-nums leading-none text-[var(--text-primary)]">
                {summary.manualDueOrOverdue}
              </span>
              <span className="mt-2 block text-xs leading-snug text-[var(--text-secondary)]">
                {t("dashboard.manualTasksNeedAction")}
              </span>
            </span>
          </Link>

          <Link
            href="/dashboard/tasks?status=open&type=birthday"
            className={metricLinkClass(
              "border-[color:color-mix(in_srgb,var(--line-subtle)_76%,transparent)] bg-[color-mix(in_srgb,var(--bg-elevated)_88%,transparent)] shadow-[inset_0_1px_0_color-mix(in_srgb,var(--bg-elevated)_72%,transparent)]",
            )}
          >
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--highlight)_22%,var(--bg-elevated))] text-[color-mix(in_srgb,var(--accent-strong)_88%,var(--warning)_12%)]"
              aria-hidden
            >
              <Cake className="h-5 w-5" strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-start justify-between gap-2">
                <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  {t("dashboard.birthdays7Days")}
                </span>
                <ChevronRight
                  className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)] opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100"
                  aria-hidden
                  strokeWidth={2}
                />
              </span>
              <span className="mt-1 block font-display text-[1.65rem] font-normal tabular-nums leading-none text-[var(--text-primary)]">
                {summary.birthdaysInNext7Days}
              </span>
              <span className="mt-2 block text-xs leading-snug text-[var(--text-secondary)]">
                {t("dashboard.sameWindowAsReminders")}
              </span>
            </span>
          </Link>

          {isAdmin && occupancyPercent != null ? (
            <Link
              href="/dashboard/analytics/occupancy"
              className={metricLinkClass(
                "border-[color-mix(in_srgb,var(--partner-green)_34%,var(--line-subtle))] bg-[color-mix(in_srgb,var(--partner-green)_9%,var(--bg-elevated))] shadow-[inset_0_1px_0_color-mix(in_srgb,var(--bg-elevated)_76%,transparent)]",
              )}
            >
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--partner-green-muted)] text-[var(--success)]"
                aria-hidden
              >
                <BedDouble className="h-5 w-5" strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    {t("nav.occupancy")}
                  </span>
                  <ChevronRight
                    className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)] opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100"
                    aria-hidden
                    strokeWidth={2}
                  />
                </span>
                <span className="mt-1 block font-display text-[1.65rem] font-normal tabular-nums leading-none text-[var(--text-primary)]">
                  {occupancyPercent}%
                </span>
                <span className="mt-2 block text-xs leading-snug text-[var(--text-secondary)]">
                  {t("dashboard.portfolioBedUtilization")}
                </span>
              </span>
            </Link>
          ) : (
            <div
              className={metricStaticClass(
                "cursor-default border-[color:color-mix(in_srgb,var(--line-subtle)_58%,transparent)] bg-[color-mix(in_srgb,var(--bg-muted)_35%,var(--bg-elevated))] opacity-[0.92]",
              )}
            >
              <span
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--partner-green)_12%,var(--bg-elevated))] text-[var(--text-muted)]"
                aria-hidden
              >
                <BedDouble className="h-5 w-5" strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  {t("nav.occupancy")}
                </span>
                <span className="mt-1 block font-display text-[1.65rem] font-normal tabular-nums leading-none text-[var(--text-muted)]">
                  —
                </span>
                <span className="mt-2 block text-xs leading-snug text-[var(--text-secondary)]">
                  {t("dashboard.adminOnlyMetric")}
                </span>
              </span>
            </div>
          )}

          <Link
            href="/dashboard/tasks?status=open&type=payment_overdue"
            className={metricLinkClass(
              payAttention
                ? "border-[color-mix(in_srgb,var(--danger)_46%,var(--warning)_22%)] bg-[color-mix(in_srgb,var(--warning)_12%,var(--bg-elevated))] shadow-[inset_0_1px_0_color-mix(in_srgb,var(--bg-elevated)_70%,transparent)]"
                : "border-[color:color-mix(in_srgb,var(--line-subtle)_76%,transparent)] bg-[color-mix(in_srgb,var(--bg-elevated)_88%,transparent)] shadow-[inset_0_1px_0_color-mix(in_srgb,var(--bg-elevated)_72%,transparent)]",
            )}
          >
            <span
              className={
                payAttention
                  ? "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--danger)_18%,var(--bg-elevated))] text-[var(--danger)]"
                  : "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_12%,var(--bg-elevated))] text-[var(--accent-strong)]"
              }
              aria-hidden
            >
              <AlertTriangle className="h-5 w-5" strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-start justify-between gap-2">
                <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  {t("dashboard.duePayments")}
                </span>
                <ChevronRight
                  className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)] opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100"
                  aria-hidden
                  strokeWidth={2}
                />
              </span>
              <span
                className={
                  payAttention
                    ? "mt-1 block font-display text-[1.65rem] font-normal tabular-nums leading-none text-[color-mix(in_srgb,var(--danger)_92%,var(--text-primary)_8%)]"
                    : "mt-1 block font-display text-[1.65rem] font-normal tabular-nums leading-none text-[var(--text-primary)]"
                }
              >
                {summary.overduePayments}
              </span>
              <span className="mt-2 block text-xs leading-snug text-[var(--text-secondary)]">
                {payAttention
                  ? t("dashboard.overdueBillingReview")
                  : t("dashboard.noOverduePayments")}
              </span>
            </span>
          </Link>
        </div>
        </div>
      </div>
    </section>
  );
}

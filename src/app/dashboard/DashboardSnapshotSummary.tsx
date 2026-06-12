"use client";

import { buildDashboardSnapshotSummary } from "@/lib/dashboard/snapshotBriefing";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { TasksDashboardSummary } from "@/lib/tasks/service";

type DashboardSnapshotSummaryProps = {
  summary: TasksDashboardSummary;
  occupancyPercent: number | null;
  isAdmin: boolean;
};

export function DashboardSnapshotSummary({
  summary,
  occupancyPercent,
  isAdmin,
}: DashboardSnapshotSummaryProps) {
  const { locale } = useI18n();
  const line = buildDashboardSnapshotSummary(
    summary,
    { occupancyPercent, isAdmin },
    locale,
  );

  return (
    <p className="max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
      {line}
    </p>
  );
}

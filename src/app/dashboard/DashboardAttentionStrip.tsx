"use client";

import { useI18n } from "@/lib/i18n/I18nProvider";
import { translateWith } from "@/lib/i18n/messages";
import Link from "next/link";
import { AlertTriangle, ClipboardList, ChevronRight } from "lucide-react";

type DashboardAttentionStripProps = {
  overduePayments: number;
  manualDueOrOverdue: number;
};

export function DashboardAttentionStrip({
  overduePayments,
  manualDueOrOverdue,
}: DashboardAttentionStripProps) {
  const { t, locale } = useI18n();
  const needsAttention = overduePayments > 0 || manualDueOrOverdue > 0;

  if (!needsAttention) {
    return (
      <div
        className="rounded-2xl border border-[color-mix(in_srgb,var(--partner-green)_38%,var(--line-subtle))] bg-[color-mix(in_srgb,var(--partner-green)_8%,var(--bg-elevated))] px-4 py-3 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--bg-elevated)_76%,transparent)]"
        role="status"
      >
        <p className="text-sm leading-snug text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--success)]">
            {t("sections.allClear")}
          </span>
          {" — "}
          {t("dashboard.allClearSuffix")}
        </p>
      </div>
    );
  }

  const manualTaskLabel =
    manualDueOrOverdue === 1
      ? t("dashboard.manualTaskDueOne")
      : translateWith(locale, "dashboard.manualTaskDueMany", {
          count: manualDueOrOverdue,
        });

  const overduePaymentLabel =
    overduePayments === 1
      ? t("dashboard.overduePaymentOne")
      : translateWith(locale, "dashboard.overduePaymentMany", {
          count: overduePayments,
        });

  return (
    <div
      className="rounded-2xl border border-[color-mix(in_srgb,var(--warning)_42%,var(--danger)_18%)] bg-[color-mix(in_srgb,var(--warning)_10%,var(--bg-elevated))] px-4 py-3.5 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--bg-elevated)_72%,transparent)]"
      role="region"
      aria-labelledby="dashboard-attention-heading"
    >
      <p
        id="dashboard-attention-heading"
        className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]"
      >
        {t("sections.needsAttention")}
      </p>
      <ul className="mt-2.5 space-y-2">
        {manualDueOrOverdue > 0 ? (
          <li>
            <Link
              href="/dashboard/tasks?status=open&type=manual"
              className="group village-lift flex items-start gap-3 rounded-xl border border-[color-mix(in_srgb,var(--accent)_28%,var(--line-subtle))] bg-[color-mix(in_srgb,var(--bg-elevated)_88%,transparent)] px-3 py-2.5 text-sm no-underline transition hover:border-[color-mix(in_srgb,var(--accent)_42%,var(--line-subtle))]"
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--accent)_14%,var(--bg-elevated))] text-[var(--accent-strong)]"
                aria-hidden
              >
                <ClipboardList className="h-4 w-4" strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1 pt-0.5">
                <span className="font-semibold text-[var(--text-primary)]">
                  {manualTaskLabel}
                </span>
                <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">
                  {t("dashboard.openInboxHint")}
                </span>
              </span>
              <ChevronRight
                className="mt-1 h-4 w-4 shrink-0 text-[var(--text-muted)] opacity-70 transition group-hover:translate-x-0.5 group-hover:opacity-100"
                aria-hidden
                strokeWidth={2}
              />
            </Link>
          </li>
        ) : null}
        {overduePayments > 0 ? (
          <li>
            <Link
              href="/dashboard/tasks?status=open&type=payment_overdue"
              className="group village-lift flex items-start gap-3 rounded-xl border border-[color-mix(in_srgb,var(--danger)_38%,var(--warning)_22%)] bg-[color-mix(in_srgb,var(--danger)_6%,var(--bg-elevated))] px-3 py-2.5 text-sm no-underline transition hover:border-[color-mix(in_srgb,var(--danger)_48%,var(--warning)_18%)]"
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--danger)_16%,var(--bg-elevated))] text-[var(--danger)]"
                aria-hidden
              >
                <AlertTriangle className="h-4 w-4" strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1 pt-0.5">
                <span className="font-semibold text-[color-mix(in_srgb,var(--danger)_92%,var(--text-primary)_8%)]">
                  {overduePaymentLabel}
                </span>
                <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">
                  {t("dashboard.reviewBillingHint")}
                </span>
              </span>
              <ChevronRight
                className="mt-1 h-4 w-4 shrink-0 text-[var(--text-muted)] opacity-70 transition group-hover:translate-x-0.5 group-hover:opacity-100"
                aria-hidden
                strokeWidth={2}
              />
            </Link>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

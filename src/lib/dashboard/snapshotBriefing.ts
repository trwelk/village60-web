import type { AppLocale } from "@/lib/i18n/locales";
import { createTranslator, translateWith } from "@/lib/i18n/messages";
import type { TasksDashboardSummary } from "@/lib/tasks/service";

/** Local-part token before @, first segment after splitting on common separators. */
export function displayFirstNameFromEmail(
  email: string | undefined | null,
): string {
  const raw = email?.trim().split("@")[0]?.trim();
  if (!raw) return "there";
  const token = raw.split(/[._+\-]/)[0] ?? raw;
  if (!token) return "there";
  return (
    token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
  );
}

export function utcWeekdayLong(asOfDateUtc: string): string {
  return new Intl.DateTimeFormat("en-NZ", {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${asOfDateUtc}T12:00:00.000Z`));
}

/**
 * One-line briefing matching dashboard tile rules (tasks summary + optional admin occupancy).
 */
export function buildDashboardSnapshotSummary(
  summary: TasksDashboardSummary,
  opts: { occupancyPercent: number | null; isAdmin: boolean },
  locale: AppLocale,
): string {
  const t = createTranslator(locale);
  const parts: string[] = [];

  if (summary.birthdaysInNext7Days === 0) {
    parts.push(t("dashboard.snapshotNoBirthdays7Days"));
  } else if (summary.birthdaysInNext7Days === 1) {
    parts.push(t("dashboard.snapshotBirthdayOne"));
  } else {
    parts.push(
      translateWith(locale, "dashboard.snapshotBirthdayMany", {
        count: summary.birthdaysInNext7Days,
      }),
    );
  }

  if (summary.manualDueOrOverdue === 1) {
    parts.push(t("dashboard.snapshotManualTaskOne"));
  } else if (summary.manualDueOrOverdue > 1) {
    parts.push(
      translateWith(locale, "dashboard.snapshotManualTaskMany", {
        count: summary.manualDueOrOverdue,
      }),
    );
  } else {
    parts.push(t("dashboard.snapshotNoManualTasks"));
  }

  if (summary.overduePayments === 1) {
    parts.push(t("dashboard.overduePaymentOne"));
  } else if (summary.overduePayments > 1) {
    parts.push(
      translateWith(locale, "dashboard.overduePaymentMany", {
        count: summary.overduePayments,
      }),
    );
  } else {
    parts.push(t("dashboard.noOverduePayments"));
  }

  if (opts.isAdmin && opts.occupancyPercent != null) {
    parts.push(
      translateWith(locale, "dashboard.snapshotPortfolioOccupancy", {
        percent: opts.occupancyPercent,
      }),
    );
  }

  return parts.join(" · ");
}

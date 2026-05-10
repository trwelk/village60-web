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
): string {
  const parts: string[] = [];

  if (summary.birthdaysInNext7Days === 0) {
    parts.push("No birthdays in the next 7 days");
  } else if (summary.birthdaysInNext7Days === 1) {
    parts.push("1 resident has a birthday in the next 7 days");
  } else {
    parts.push(
      `${summary.birthdaysInNext7Days} residents have birthdays in the next 7 days`,
    );
  }

  if (summary.manualDueOrOverdue === 1) {
    parts.push("1 manual task needs attention");
  } else if (summary.manualDueOrOverdue > 1) {
    parts.push(`${summary.manualDueOrOverdue} manual tasks need attention`);
  } else {
    parts.push("No manual tasks are due or overdue");
  }

  if (summary.overduePayments === 1) {
    parts.push("1 overdue payment reminder");
  } else if (summary.overduePayments > 1) {
    parts.push(`${summary.overduePayments} overdue payment reminders`);
  } else {
    parts.push("No overdue payment reminders");
  }

  if (opts.isAdmin && opts.occupancyPercent != null) {
    parts.push(`portfolio occupancy is ${opts.occupancyPercent}%`);
  }

  return parts.join(" · ");
}

import Link from "next/link";
import type { TasksDashboardSummary } from "@/lib/tasks/service";

type TasksRemindersSummaryCardProps = {
  summary: TasksDashboardSummary;
};

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 text-center sm:text-left">
      <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-ink/48">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-normal tabular-nums text-pine-2">
        {value}
      </p>
    </div>
  );
}

export function TasksRemindersSummaryCard({
  summary,
}: TasksRemindersSummaryCardProps) {
  return (
    <section
      className="village-reveal flex flex-col gap-4 rounded-2xl border border-pine/10 bg-cream/92 p-5 shadow-[0_18px_48px_-32px_rgba(12,24,20,0.32)] sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-6"
      aria-labelledby="tasks-dashboard-summary-heading"
    >
      <div className="min-w-0 flex-1">
        <h2
          id="tasks-dashboard-summary-heading"
          className="font-display text-lg font-normal tracking-tight text-pine-2 sm:text-xl"
        >
          Tasks & reminders
        </h2>
        <p className="village-muted mt-2 text-sm leading-relaxed">
          A quick snapshot of what needs attention in your homes.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-3 sm:gap-6">
          <StatPill
            label="Overdue payments"
            value={summary.overduePayments}
          />
          <StatPill
            label="Tasks due / overdue"
            value={summary.manualDueOrOverdue}
          />
          <StatPill
            label="Birthdays (7 days)"
            value={summary.birthdaysInNext7Days}
          />
        </div>
      </div>
      <div className="shrink-0 sm:self-center">
        <Link
          href="/dashboard/tasks"
          className="village-btn-primary inline-flex w-full min-h-10 justify-center no-underline sm:w-auto"
        >
          View tasks
        </Link>
      </div>
    </section>
  );
}

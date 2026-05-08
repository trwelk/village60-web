import { LocalTime } from "@/components/LocalTime";
import { authEvents } from "@/db/schema";
import { getDb } from "@/db/client";
import {
  listMonthEndCensusChart,
  listResidentsPerHomeChart,
  overallOccupancyPercent,
  sumConfiguredBedsAllActiveSites,
} from "@/lib/dashboard/charts";
import { listUpcomingBirthdaysForDashboard } from "@/lib/dashboard/birthdays";
import { listOccupancyHeatmapBoard } from "@/lib/dashboard/occupancyHeatmap";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getTasksDashboardSummary } from "@/lib/tasks/service";
import { and, desc, eq } from "drizzle-orm";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { DashboardAnalyticsSection } from "./DashboardAnalyticsSection";
import { OccupancyHeatmapBoardCard } from "./OccupancyHeatmapBoardCard";
import { ResidentBirthdayBoardCard } from "./ResidentBirthdayBoardCard";
import { TasksRemindersSummaryCard } from "./TasksRemindersSummaryCard";

export default async function DashboardPage() {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const userId = session.userId!;
  const db = getDb();

  const lastSignIn = db
    .select()
    .from(authEvents)
    .where(
      and(eq(authEvents.userId, userId), eq(authEvents.eventType, "sign_in")),
    )
    .orderBy(desc(authEvents.occurredAtUtcMs))
    .limit(1)
    .get();
  const residentsPerHome =
    session.role === "admin" ? listResidentsPerHomeChart(db) : [];
  const totalActiveResidentsAllHomes = residentsPerHome.reduce(
    (sum, row) => sum + row.residentCount,
    0,
  );
  const configuredBedsAllSites =
    session.role === "admin" ? sumConfiguredBedsAllActiveSites(db) : 0;
  const occupancyPercentAllSites =
    session.role === "admin"
      ? overallOccupancyPercent(
          totalActiveResidentsAllHomes,
          configuredBedsAllSites,
        )
      : null;
  const monthEndCensus =
    session.role === "admin" ? listMonthEndCensusChart(db) : [];

  const taskSummary = getTasksDashboardSummary(db, {
    userId,
    role: session.role ?? "care",
  });
  const asOfDateUtc = new Date().toISOString().slice(0, 10);
  const birthdayBoardAsOfLabel = new Intl.DateTimeFormat("en-NZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${asOfDateUtc}T12:00:00.000Z`));
  const sessionActor = { userId, role: session.role ?? "care" };
  const birthdayBoardWeek = listUpcomingBirthdaysForDashboard(
    db,
    sessionActor,
    asOfDateUtc,
    "week",
  );
  const birthdayBoardMonth = listUpcomingBirthdaysForDashboard(
    db,
    sessionActor,
    asOfDateUtc,
    "month",
  );
  const occupancyBoard =
    session.role === "admin" ? listOccupancyHeatmapBoard(db) : null;

  return (
    <main className="flex flex-col gap-8 text-[var(--text-primary)]">
      <div className="village-card village-reveal p-5 sm:p-6">
        <div className="grid max-w-[38rem] gap-2 text-sm sm:grid-cols-2 lg:max-w-none lg:grid-cols-4 lg:gap-2 lg:w-[37.5rem]">
          <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-subtle)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_62%,transparent)] px-3 py-2.5">
            <span className="village-field-label block">Tasks</span>
            <span className="mt-1 block font-display text-2xl text-[var(--text-primary)] tabular-nums">
              {taskSummary.manualDueOrOverdue}
            </span>
          </div>
          <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-subtle)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_62%,transparent)] px-3 py-2.5">
            <span className="village-field-label block">Birthdays</span>
            <span className="mt-1 block font-display text-2xl text-[var(--text-primary)] tabular-nums">
              {taskSummary.birthdaysInNext7Days}
            </span>
          </div>
          <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-subtle)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_62%,transparent)] px-3 py-2.5">
            <span className="village-field-label block">Occupancy</span>
            <span className="mt-1 block font-display text-2xl text-[var(--text-primary)] tabular-nums">
              {occupancyPercentAllSites != null ? `${occupancyPercentAllSites}%` : "—"}
            </span>
          </div>
          <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-subtle)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_62%,transparent)] px-3 py-2.5">
            <span className="village-field-label block">Due Payments</span>
            <span className="mt-1 block font-display text-2xl text-[var(--text-primary)] tabular-nums">
              {taskSummary.overduePayments}
            </span>
          </div>
        </div>
      </div>
      <TasksRemindersSummaryCard summary={taskSummary} />
      <ResidentBirthdayBoardCard
        week={birthdayBoardWeek}
        month={birthdayBoardMonth}
        asOfLabel={birthdayBoardAsOfLabel}
      />
      {occupancyBoard ? (
        <OccupancyHeatmapBoardCard board={occupancyBoard} />
      ) : null}
      <DashboardAnalyticsSection
        role={session.role ?? "care"}
        residentsPerHome={residentsPerHome}
        totalActiveResidentsAllHomes={totalActiveResidentsAllHomes}
        configuredBedsAllSites={configuredBedsAllSites}
        occupancyPercentAllSites={occupancyPercentAllSites}
        monthEndCensus={monthEndCensus}
      />
      {lastSignIn ? (
        <LocalTime
          utcMs={lastSignIn.occurredAtUtcMs}
          label="Last successful sign-in (your local time):"
        />
      ) : null}
    </main>
  );
}

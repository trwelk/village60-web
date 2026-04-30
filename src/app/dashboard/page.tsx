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
      <div className="village-card village-reveal relative overflow-hidden border border-[color:color-mix(in_srgb,var(--line-strong)_52%,transparent)] bg-[linear-gradient(130deg,color-mix(in_srgb,var(--bg-elevated)_95%,transparent),color-mix(in_srgb,var(--bg-muted)_88%,transparent))] px-6 py-7 shadow-[0_18px_42px_-28px_color-mix(in_srgb,var(--accent)_45%,transparent)]">
        <div
          aria-hidden
          className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_18%,transparent),transparent_46%)]"
        />
        <div className="relative max-w-3xl">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">
            Operations hub
          </p>
          <h1 className="village-page-title mt-3">Dashboard</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Sign-in history, tasks, upcoming birthdays, and at-a-glance occupancy
            below.
          </p>
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

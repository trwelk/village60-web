import { LocalTime } from "@/components/LocalTime";
import { authEvents } from "@/db/schema";
import { getDb } from "@/db/client";
import {
  listResidentsPerHomeChart,
  overallOccupancyPercent,
  sumConfiguredBedsAllActiveSites,
} from "@/lib/dashboard/charts";
import { listUpcomingBirthdaysForDashboard } from "@/lib/dashboard/birthdays";
import { listOccupancyHeatmapBoard } from "@/lib/dashboard/occupancyHeatmap";
import { utcWeekdayLong } from "@/lib/dashboard/snapshotBriefing";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getTasksDashboardSummary } from "@/lib/tasks/service";
import { and, desc, eq } from "drizzle-orm";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { OccupancyHeatmapBoardCard } from "./OccupancyHeatmapBoardCard";
import { ResidentBirthdayBoardCard } from "./ResidentBirthdayBoardCard";
import { DashboardTasksSnapshot } from "./DashboardTasksSnapshot";
import { DashboardTodayBirthdaysBanner } from "./DashboardTodayBirthdaysBanner";

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
  const birthdaysTodayUtc = birthdayBoardWeek.filter(
    (row) => row.birthdayDate === asOfDateUtc,
  );
  const weekdayUtcLong = utcWeekdayLong(asOfDateUtc);
  const birthdayBoardMonth = listUpcomingBirthdaysForDashboard(
    db,
    sessionActor,
    asOfDateUtc,
    "month",
  );
  const occupancyBoard =
    session.role === "admin" ? listOccupancyHeatmapBoard(db) : null;

  return (
    <main className="flex flex-col gap-6 text-[var(--text-primary)]">
      <DashboardTodayBirthdaysBanner entries={birthdaysTodayUtc} />
      <DashboardTasksSnapshot
        summary={taskSummary}
        occupancyPercent={occupancyPercentAllSites}
        isAdmin={session.role === "admin"}
        email={session.email}
        weekdayUtcLong={weekdayUtcLong}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_minmax(0,26rem)]">
        <div className="flex min-w-0 flex-col gap-6">
          {occupancyBoard ? (
            <OccupancyHeatmapBoardCard board={occupancyBoard} />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <ResidentBirthdayBoardCard
            week={birthdayBoardWeek}
            month={birthdayBoardMonth}
            asOfLabel={birthdayBoardAsOfLabel}
          />
        </div>
      </div>
      {lastSignIn ? (
        <LocalTime
          utcMs={lastSignIn.occurredAtUtcMs}
          label="Last successful sign-in (your local time):"
        />
      ) : null}
    </main>
  );
}

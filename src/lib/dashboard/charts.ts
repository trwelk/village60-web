import { and, asc, eq, isNull, sql } from "drizzle-orm";
import {
  homes,
  residentDepartureDetails,
  residents,
  wards,
} from "@/db/schema";
import {
  getAppTimezone,
  lastInstantOfMonthUtcMs,
  zonedDateAtUtcMs,
} from "@/lib/config/appTimezone";
import type { AppDb } from "@/lib/homes/service";

export type ResidentsPerHomeChartDatum = {
  homeId: string;
  homeName: string;
  residentCount: number;
};

export type MonthEndCensusHomeCount = {
  homeId: string;
  homeName: string;
  residentCount: number;
};

export type MonthEndCensusChartDatum = {
  monthKey: string;
  monthLabel: string;
  homeCounts: MonthEndCensusHomeCount[];
};

export type DashboardHomeOption = {
  homeId: string;
  homeName: string;
};

type ListMonthEndCensusChartOptions = {
  nowUtcMs?: number;
  timeZone?: string;
};

const monthLabelFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
});

function listActiveHomes(db: AppDb) {
  return db
    .select()
    .from(homes)
    .where(isNull(homes.archivedAtUtcMs))
    .orderBy(asc(homes.name))
    .all();
}

/**
 * Sum of `wards.bed_count` for wards in non-archived homes, excluding archived
 * wards. SQL `SUM` skips null bed counts (unconfigured wards contribute nothing).
 */
export function sumConfiguredBedsAllActiveSites(db: AppDb): number {
  const row = db
    .select({
      total: sql<number>`ifnull(sum(${wards.bedCount}), 0)`,
    })
    .from(wards)
    .innerJoin(homes, eq(wards.homeId, homes.id))
    .where(
      and(isNull(homes.archivedAtUtcMs), isNull(wards.archivedAtUtcMs)),
    )
    .get();
  return Number(row?.total ?? 0);
}

/**
 * Active residents ÷ configured beds (see `sumConfiguredBedsAllActiveSites`),
 * rounded to the nearest whole percent. Null when there are no configured beds.
 */
export function overallOccupancyPercent(
  activeResidentsAllSites: number,
  configuredBedsAllSites: number,
): number | null {
  if (configuredBedsAllSites <= 0) {
    return null;
  }
  return Math.round((activeResidentsAllSites / configuredBedsAllSites) * 100);
}

export function listDashboardHomeOptions(db: AppDb): DashboardHomeOption[] {
  return listActiveHomes(db).map((home) => ({
    homeId: home.id,
    homeName: home.name,
  }));
}

function formatIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function listResidentsPerHomeChart(
  db: AppDb,
): ResidentsPerHomeChartDatum[] {
  const activeHomes = listActiveHomes(db);

  return activeHomes.map((home) => ({
    homeId: home.id,
    homeName: home.name,
    residentCount: db
      .select()
      .from(residents)
      .where(
        and(eq(residents.homeId, home.id), eq(residents.status, "active")),
      )
      .all().length,
  }));
}

export function listMonthEndCensusChart(
  db: AppDb,
  options: ListMonthEndCensusChartOptions = {},
): MonthEndCensusChartDatum[] {
  const timeZone = options.timeZone ?? getAppTimezone();
  const nowUtcMs = options.nowUtcMs ?? Date.now();
  const { year, month } = zonedDateAtUtcMs(nowUtcMs, timeZone);
  const activeHomes = listActiveHomes(db);

  return Array.from({ length: month }, (_, index) => {
    const month1Based = index + 1;
    const monthEndUtcMs = lastInstantOfMonthUtcMs(year, month1Based, timeZone);
    const cutoffDate = formatIsoDate(
      year,
      month1Based,
      zonedDateAtUtcMs(monthEndUtcMs, timeZone).day,
    );

    return {
      monthKey: `${year}-${String(month1Based).padStart(2, "0")}`,
      monthLabel: monthLabelFormatter.format(
        new Date(Date.UTC(year, month1Based - 1, 1)),
      ),
      homeCounts: activeHomes.map((home) => ({
        homeId: home.id,
        homeName: home.name,
        residentCount: db
          .select({
            admissionDate: residents.admissionDate,
            departureAtUtcMs: residentDepartureDetails.departedAtUtcMs,
          })
          .from(residents)
          .leftJoin(
            residentDepartureDetails,
            eq(residents.id, residentDepartureDetails.residentId),
          )
          .where(eq(residents.homeId, home.id))
          .all()
          .filter(
            (resident) =>
              resident.admissionDate <= cutoffDate &&
              (resident.departureAtUtcMs === null ||
                resident.departureAtUtcMs > monthEndUtcMs),
          ).length,
      })),
    };
  });
}

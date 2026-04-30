import { and, eq, inArray } from "drizzle-orm";
import { homes, residents, wards } from "@/db/schema";
import { getCareUserAssignedHomeIds } from "@/lib/authz/homeScope";
import type { SessionActor } from "@/lib/authz/sessionActor";
import type { AppDb } from "@/lib/homes/service";
import { calculateAge } from "@/lib/residents/age";

export type BirthdayBoardRange = "week" | "month";

export type DashboardBirthdayEntry = {
  residentId: string;
  residentName: string;
  homeId: string;
  homeName: string;
  /** Ward label when assigned. */
  wardLabel: string | null;
  /** Next calendar occurrence YYYY-MM-DD (same rules as the tasks inbox). */
  birthdayDate: string;
  /** Age the resident will turn on that day. */
  ageTurning: number;
};

function isoDateFromUtcParts(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addUtcDays(dateOnly: string, days: number): string {
  const [y, m, d] = dateOnly.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return isoDateFromUtcParts(
    dt.getUTCFullYear(),
    dt.getUTCMonth() + 1,
    dt.getUTCDate(),
  );
}

function endOfUtcMonth(dateOnly: string): string {
  const [y, m] = dateOnly.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return isoDateFromUtcParts(y, m, last);
}

/**
 * Next birthday on or after as-of in the as-of year, or the following year
 * (matches `listResidentBirthdayReminders` in tasks/service).
 */
function birthdayOccurrenceForWindow(dob: string, asOfDateUtc: string): string {
  const asOfYear = Number(asOfDateUtc.slice(0, 4));
  const [, birthMonth, birthDay] = dob.split("-").map(Number);
  const thisYearBirthday = isoDateFromUtcParts(asOfYear, birthMonth, birthDay);
  if (thisYearBirthday >= asOfDateUtc) {
    return thisYearBirthday;
  }
  return isoDateFromUtcParts(asOfYear + 1, birthMonth, birthDay);
}

function windowEndForRange(asOf: string, range: BirthdayBoardRange): string {
  if (range === "week") {
    return addUtcDays(asOf, 7);
  }
  return endOfUtcMonth(asOf);
}

function loadResidentRowsWithWards(
  db: AppDb,
  actor: SessionActor,
): {
  residentId: string;
  residentName: string;
  dob: string;
  homeId: string;
  homeName: string;
  wardLabel: string | null;
}[] {
  const active = eq(residents.status, "active");
  const base = db
    .select({
      residentId: residents.id,
      residentName: residents.fullName,
      dob: residents.dob,
      homeId: residents.homeId,
      homeName: homes.name,
      wardLabel: wards.label,
    })
    .from(residents)
    .innerJoin(homes, eq(homes.id, residents.homeId))
    .leftJoin(wards, eq(wards.id, residents.wardId));

  if (actor.role === "admin") {
    return base.where(active).all();
  }
  const allowed = getCareUserAssignedHomeIds(db, actor.userId);
  if (allowed.size === 0) {
    return [];
  }
  return base
    .where(and(active, inArray(residents.homeId, [...allowed])))
    .all();
}

/**
 * Upcoming active-resident birthdays in the home scope, ordered by date then name.
 * Week: same rolling 7-day upper bound as the tasks summary (`birthdaysInNext7Days`).
 * Month: from as-of through the end of that calendar month (UTC date parts).
 */
export function listUpcomingBirthdaysForDashboard(
  db: AppDb,
  actor: SessionActor,
  asOfDateUtc: string,
  range: BirthdayBoardRange,
): DashboardBirthdayEntry[] {
  const windowEnd = windowEndForRange(asOfDateUtc, range);
  const rows = loadResidentRowsWithWards(db, actor);
  const withDates = rows
    .map((row) => {
      const birthdayDate = birthdayOccurrenceForWindow(row.dob, asOfDateUtc);
      if (birthdayDate > windowEnd) {
        return null;
      }
      const ageTurning = calculateAge(row.dob, birthdayDate);
      return {
        residentId: row.residentId,
        residentName: row.residentName,
        homeId: row.homeId,
        homeName: row.homeName,
        wardLabel: row.wardLabel,
        birthdayDate,
        ageTurning,
      } satisfies DashboardBirthdayEntry;
    })
    .filter((x): x is DashboardBirthdayEntry => x !== null);
  withDates.sort((a, b) => {
    const byDate = a.birthdayDate.localeCompare(b.birthdayDate);
    if (byDate !== 0) {
      return byDate;
    }
    return a.residentName.localeCompare(b.residentName);
  });
  return withDates;
}

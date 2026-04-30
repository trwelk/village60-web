import { and, count, eq, isNull } from "drizzle-orm";
import { homes, residents, users } from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";
import { calculateAge } from "@/lib/residents/age";

export const AGE_BAND_LABELS = [
  "Under 70",
  "70–74",
  "75–79",
  "80–84",
  "85–89",
  "90–94",
  "95 and over",
] as const;

export type AgeBandLabel = (typeof AGE_BAND_LABELS)[number];

export function utcDateStringFromUtcMs(atUtcMs: number): string {
  const d = new Date(atUtcMs);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Maps completed age years to histogram band index `0…6` aligned with {@link AGE_BAND_LABELS}.
 */
export function ageBandIndexForAge(age: number): number {
  if (age < 70) return 0;
  if (age <= 74) return 1;
  if (age <= 79) return 2;
  if (age <= 84) return 3;
  if (age <= 89) return 4;
  if (age <= 94) return 5;
  return 6;
}

export type AgeHistogramDatum = {
  bandLabel: AgeBandLabel;
  count: number;
  sharePercent: number;
};

export type DemographicsKpis = {
  totalActiveResidents: number;
  residents90PlusCount: number;
  residents90PlusSharePercent: number | null;
  ageHistogram: AgeHistogramDatum[];
};

export function computeDemographicsFromDobs(
  dobs: string[],
  utcToday: string,
): DemographicsKpis {
  const total = dobs.length;
  const counts = [0, 0, 0, 0, 0, 0, 0];
  let n90 = 0;
  for (const dob of dobs) {
    const age = calculateAge(dob, utcToday);
    if (age >= 90) n90++;
    counts[ageBandIndexForAge(age)]++;
  }
  const ageHistogram: AgeHistogramDatum[] = AGE_BAND_LABELS.map(
    (bandLabel, i) => ({
      bandLabel,
      count: counts[i]!,
      sharePercent: total > 0 ? Math.round((100 * counts[i]!) / total) : 0,
    }),
  );
  return {
    totalActiveResidents: total,
    residents90PlusCount: n90,
    residents90PlusSharePercent:
      total > 0 ? Math.round((100 * n90) / total) : null,
    ageHistogram,
  };
}

export function getDemographicsAnalytics(
  db: AppDb,
  atUtcMs: number,
): DemographicsKpis {
  const utcToday = utcDateStringFromUtcMs(atUtcMs);
  const rows = db
    .select({ dob: residents.dob })
    .from(residents)
    .innerJoin(homes, eq(homes.id, residents.homeId))
    .where(
      and(eq(residents.status, "active"), isNull(homes.archivedAtUtcMs)),
    )
    .all();
  return computeDemographicsFromDobs(rows.map((r) => r.dob), utcToday);
}

export type ResidentPerNurseDatum = {
  nurseUserId: string;
  label: string;
  residentCount: number;
};

function nurseLabel(displayName: string | null, email: string): string {
  const t = displayName?.trim();
  return t ? t : email;
}

/** Care users with at least one active resident in a non-archived home; sorted by resident count descending. */
export function listResidentsPerCareNurse(db: AppDb): ResidentPerNurseDatum[] {
  const rows = db
    .select({
      nurseId: users.id,
      displayName: users.displayName,
      email: users.email,
      c: count(),
    })
    .from(residents)
    .innerJoin(users, eq(residents.assignedNurseUserId, users.id))
    .innerJoin(homes, eq(residents.homeId, homes.id))
    .where(
      and(
        eq(residents.status, "active"),
        eq(users.role, "care"),
        isNull(homes.archivedAtUtcMs),
      ),
    )
    .groupBy(users.id)
    .all();

  const mapped: ResidentPerNurseDatum[] = rows.map((r) => ({
    nurseUserId: r.nurseId,
    label: nurseLabel(r.displayName, r.email),
    residentCount: Number(r.c),
  }));
  mapped.sort((a, b) => {
    const d = b.residentCount - a.residentCount;
    return d !== 0 ? d : a.label.localeCompare(b.label);
  });
  return mapped;
}

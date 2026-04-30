import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { homes, residents, wards } from "@/db/schema";
import type { AppDb } from "@/lib/homes/service";

/** Legend buckets for configured ward capacity tiles. */
export type OccupancyHeatmapBand = "green" | "amber" | "red" | "over" | "neutral";

export type OccupancyHeatmapWardTile =
  | {
      kind: "ward";
      wardId: string;
      label: string;
      notConfigured: true;
    }
  | {
      kind: "ward";
      wardId: string;
      label: string;
      notConfigured: false;
      /** Whole percent: active ÷ bedCount. */
      occupancyPercent: number;
      occupied: number;
      bedCount: number;
      availableBeds: number;
      band: OccupancyHeatmapBand;
    };

export type OccupancyHeatmapUnassignedTile = {
  kind: "unassigned";
  count: number;
};

export type OccupancyHeatmapHomeHeader =
  | {
      display: "configured";
      occupied: number;
      configuredBeds: number;
      occupancyPercent: number;
    }
  | { display: "not_configured" };

export type OccupancyHeatmapHomeRow = {
  homeId: string;
  homeName: string;
  /** Sorting: home has a ward in red (90%+) or over-capacity. */
  hasSevereWard: boolean;
  header: OccupancyHeatmapHomeHeader;
  /**
   * Per-home scenario (not the global no-homes case).
   * `only_unconfigured`: at least one ward, all have null/invalid bed count.
   */
  homeNotice: "no_wards" | "only_unconfigured" | null;
  wardTiles: OccupancyHeatmapWardTile[];
  unassigned: OccupancyHeatmapUnassignedTile;
};

export type OccupancyHeatmapBoardModel =
  | { boardKind: "no_homes" }
  | { boardKind: "homes"; homes: OccupancyHeatmapHomeRow[] };

/**
 * Public helper: occupancy color band for a ward with known capacity.
 * `bedCount` null/≤0 → neutral (not configured). Over-capacity when occupied &gt; bedCount.
 */
export function occupancyBandForWard(
  occupied: number,
  bedCount: number | null,
): OccupancyHeatmapBand {
  if (bedCount == null || bedCount <= 0) {
    return "neutral";
  }
  if (occupied > bedCount) {
    return "over";
  }
  const pct = Math.round((occupied / bedCount) * 100);
  if (pct >= 90) {
    return "red";
  }
  if (pct >= 70) {
    return "amber";
  }
  return "green";
}

/**
 * `true` when this ward would appear red or over-capacity in the legend (affects home ordering).
 */
export function wardIsSevere(occupied: number, bedCount: number | null): boolean {
  if (bedCount == null || bedCount <= 0) {
    return false;
  }
  if (occupied > bedCount) {
    return true;
  }
  return Math.round((occupied / bedCount) * 100) >= 90;
}

function sumConfiguredBeds(wardList: { bedCount: number | null }[]): number {
  return wardList.reduce(
    (acc, w) => acc + (w.bedCount != null && w.bedCount > 0 ? w.bedCount : 0),
    0,
  );
}

function buildHomeRow(
  home: { id: string; name: string },
  wardRows: {
    id: string;
    label: string;
    sortOrder: number | null;
    bedCount: number | null;
  }[],
  activeResidents: { homeId: string; wardId: string | null }[],
): OccupancyHeatmapHomeRow {
  const validWardIds = new Set(wardRows.map((w) => w.id));
  const homeResidents = activeResidents.filter((r) => r.homeId === home.id);
  const counts = new Map<string, number>();
  let unassigned = 0;
  for (const r of homeResidents) {
    const wid = r.wardId;
    if (wid == null || !validWardIds.has(wid)) {
      unassigned += 1;
    } else {
      counts.set(wid, (counts.get(wid) ?? 0) + 1);
    }
  }

  const configuredSum = sumConfiguredBeds(wardRows);
  const totalOccupied = homeResidents.length;
  const header: OccupancyHeatmapHomeHeader =
    configuredSum > 0
      ? {
          display: "configured",
          occupied: totalOccupied,
          configuredBeds: configuredSum,
          occupancyPercent: Math.round((totalOccupied / configuredSum) * 100),
        }
      : { display: "not_configured" };

  const wardTiles: OccupancyHeatmapWardTile[] = wardRows.map((ward) => {
    const occupied = counts.get(ward.id) ?? 0;
    const cap = ward.bedCount;
    if (cap == null || cap <= 0) {
      return {
        kind: "ward",
        wardId: ward.id,
        label: ward.label,
        notConfigured: true,
      };
    }
    return {
      kind: "ward",
      wardId: ward.id,
      label: ward.label,
      notConfigured: false,
      occupancyPercent: Math.round((occupied / cap) * 100),
      occupied,
      bedCount: cap,
      availableBeds: Math.max(0, cap - occupied),
      band: occupancyBandForWard(occupied, cap),
    };
  });

  let hasSevereWard = false;
  for (const t of wardTiles) {
    if (t.notConfigured) {
      continue;
    }
    if (t.band === "red" || t.band === "over") {
      hasSevereWard = true;
      break;
    }
  }

  let homeNotice: "no_wards" | "only_unconfigured" | null = null;
  if (wardRows.length === 0) {
    homeNotice = "no_wards";
  } else if (wardRows.every((w) => w.bedCount == null || w.bedCount <= 0)) {
    homeNotice = "only_unconfigured";
  }

  return {
    homeId: home.id,
    homeName: home.name,
    hasSevereWard,
    header,
    homeNotice,
    wardTiles,
    unassigned: { kind: "unassigned", count: unassigned },
  };
}

/**
 * All non-archived homes with ward tiles (catalog order) and an Unassigned tile per home.
 * Homes with any 90–100% or over-capacity configured ward are listed first, then A–Z by name.
 */
export function listOccupancyHeatmapBoard(db: AppDb): OccupancyHeatmapBoardModel {
  const homeRows = db
    .select()
    .from(homes)
    .where(isNull(homes.archivedAtUtcMs))
    .orderBy(asc(homes.name))
    .all();

  if (homeRows.length === 0) {
    return { boardKind: "no_homes" };
  }

  const activeResidents = db
    .select({ homeId: residents.homeId, wardId: residents.wardId })
    .from(residents)
    .where(eq(residents.status, "active"))
    .all();

  const homeModels: OccupancyHeatmapHomeRow[] = homeRows.map((home) => {
    const wardRows = db
      .select()
      .from(wards)
      .where(and(eq(wards.homeId, home.id), isNull(wards.archivedAtUtcMs)))
      .orderBy(
        sql`(${wards.sortOrder} IS NULL)`,
        asc(wards.sortOrder),
        asc(wards.label),
      )
      .all();
    return buildHomeRow(
      home,
      wardRows.map((w) => ({
        id: w.id,
        label: w.label,
        sortOrder: w.sortOrder,
        bedCount: w.bedCount,
      })),
      activeResidents,
    );
  });

  homeModels.sort((a, b) => {
    if (a.hasSevereWard !== b.hasSevereWard) {
      return a.hasSevereWard ? -1 : 1;
    }
    return a.homeName.localeCompare(b.homeName, undefined, { sensitivity: "base" });
  });

  return { boardKind: "homes", homes: homeModels };
}

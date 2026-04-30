import type {
  OccupancyHeatmapBoardModel,
  OccupancyHeatmapWardTile,
} from "@/lib/dashboard/occupancyHeatmap";
import { buildOccupancyHeatmapWardResidentsQueryString } from "@/lib/residents/directoryPath";
import Link from "next/link";

type OccupancyHeatmapBoardCardProps = {
  board: OccupancyHeatmapBoardModel;
};

const legendItems: { key: string; className: string; label: string }[] = [
  {
    key: "g",
    className: "village-occ-legend village-occ-low",
    label: "0–69%",
  },
  {
    key: "a",
    className: "village-occ-legend village-occ-mid",
    label: "70–89%",
  },
  {
    key: "r",
    className: "village-occ-legend village-occ-high",
    label: "90–100%",
  },
  {
    key: "o",
    className: "village-occ-legend village-occ-over",
    label: ">100%",
  },
  {
    key: "n",
    className: "village-occ-legend village-occ-neutral-fill",
    label: "Not configured",
  },
];

function tileSurfaceClass(
  t: OccupancyHeatmapWardTile | { kind: "unassigned"; count: number },
): string {
  if (t.kind === "unassigned") {
    return "village-occ-unassigned-fill text-cream";
  }
  if (t.notConfigured) {
    return "village-occ-neutral-fill text-cream";
  }
  switch (t.band) {
    case "green":
      return "village-occ-low";
    case "amber":
      return "village-occ-mid";
    case "red":
      return "village-occ-high";
    case "over":
      return "village-occ-over";
    default:
      return "village-occ-neutral-fill text-cream";
  }
}

function occupancyBarFillClass(
  tile: OccupancyHeatmapWardTile & { notConfigured: false },
): string {
  switch (tile.band) {
    case "green":
      return "bg-pine/50";
    case "amber":
      return "bg-pine/40";
    case "red":
      return "bg-terracotta/55";
    case "over":
      return "bg-terracotta-bright/75";
    default:
      return "bg-pine/35";
  }
}

function OccupancyMiniBar({
  tile,
}: {
  tile: OccupancyHeatmapWardTile | { kind: "unassigned"; count: number };
}) {
  if (tile.kind === "unassigned" || tile.notConfigured) {
    return null;
  }
  const pct = Math.min(100, Math.max(0, tile.occupancyPercent));
  const fillClass = occupancyBarFillClass(tile);
  return (
    <div className="village-occ-bar-track" aria-hidden>
      <div
        className={`village-occ-bar-fill ${fillClass}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function WardOrUnassignedContent({
  tile,
}: {
  tile: OccupancyHeatmapWardTile | { kind: "unassigned"; count: number };
}) {
  if (tile.kind === "unassigned") {
    return (
      <>
        <p className="font-medium text-cream">Unassigned</p>
        <p className="mt-1 font-display text-2xl tabular-nums text-cream">
          {tile.count}
        </p>
        <p className="mt-1 text-xs text-cream/75">Active residents (no ward)</p>
      </>
    );
  }
  if (tile.notConfigured) {
    return (
      <>
        <p className="font-medium text-cream">{tile.label}</p>
        <p className="mt-2 text-sm text-cream/80">Not configured</p>
        <p className="mt-1 text-xs text-cream/75">No bed count on this ward</p>
      </>
    );
  }
  return (
    <>
      <p className="font-medium text-ink/90">{tile.label}</p>
      <p className="mt-1 font-display text-2xl tabular-nums text-pine-2">
        {tile.occupancyPercent}%
      </p>
      <p className="village-muted mt-1 text-sm tabular-nums">
        {tile.occupied} / {tile.bedCount} beds · {tile.availableBeds} available
      </p>
      <OccupancyMiniBar tile={tile} />
    </>
  );
}

export function OccupancyHeatmapBoardCard({ board }: OccupancyHeatmapBoardCardProps) {
  return (
    <section
      className="village-reveal rounded-2xl border border-pine/10 bg-cream/95 p-5 shadow-[0_20px_50px_-34px_rgba(12,24,20,0.38)] sm:p-6"
      aria-labelledby="occupancy-heatmap-heading"
    >
      <div className="flex flex-col gap-2">
        <h2
          id="occupancy-heatmap-heading"
          className="font-display text-lg font-normal tracking-tight text-pine-2 sm:text-xl"
        >
          Ward occupancy
        </h2>
        <p className="village-muted max-w-3xl text-sm leading-relaxed">
          At-a-glance capacity by home and ward (non-archived sites). Refresh
          the page to update figures. Ward tiles link to the residents directory
          (active residents for that ward); Unassigned is a count only.
        </p>
        <ul
          className="mt-2 flex flex-wrap gap-x-5 gap-y-2.5 text-xs font-medium text-ink/75"
          aria-label="Occupancy color legend"
        >
          {legendItems.map((item) => (
            <li key={item.key} className="flex items-center gap-2">
              <span className={item.className} aria-hidden />
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      </div>

      {board.boardKind === "no_homes" ? (
        <p className="village-muted mt-6 text-sm">
          No active homes in the directory. Add a home to see ward occupancy
          here.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-6">
          {board.homes.map((home) => (
            <li
              key={home.homeId}
              className="rounded-2xl border border-pine/10 bg-cream-muted/35 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] sm:p-5"
            >
              <div className="flex flex-col gap-1 border-b border-pine/8 pb-4 sm:flex-row sm:items-baseline sm:justify-between">
                <h3 className="font-display text-base font-normal text-pine-2 sm:text-lg">
                  {home.homeName}
                </h3>
                {home.header.display === "configured" ? (
                  <p className="text-sm tabular-nums text-ink/80">
                    {home.header.occupied} / {home.header.configuredBeds} configured
                    beds · {home.header.occupancyPercent}%
                  </p>
                ) : (
                  <p className="text-sm text-ink/65">Not configured (no bed counts)</p>
                )}
              </div>

              {home.homeNotice === "no_wards" ? (
                <p className="village-muted mt-4 text-sm leading-relaxed">
                  This home has no active wards yet. Residents without a ward
                  appear under Unassigned.
                </p>
              ) : null}
              {home.homeNotice === "only_unconfigured" ? (
                <p className="village-muted mt-4 text-sm leading-relaxed">
                  All wards are missing a bed count. Set capacity on each ward
                  to see occupancy levels.
                </p>
              ) : null}

              <div className="mt-4 flex flex-col gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {home.wardTiles.map((t) => (
                  <Link
                    key={t.wardId}
                    href={`/dashboard/residents?${buildOccupancyHeatmapWardResidentsQueryString(
                      home.homeId,
                      t.wardId,
                    )}`}
                    className={`block rounded-2xl border p-4 outline-none transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_36px_-22px_rgba(12,24,20,0.35)] focus-visible:ring-2 focus-visible:ring-pine/35 ${tileSurfaceClass(
                      t,
                    )}`}
                    aria-label={`View active residents in ${t.label} at ${home.homeName}`}
                  >
                    <WardOrUnassignedContent tile={t} />
                  </Link>
                ))}
                <div
                  className={`rounded-2xl border p-4 ${tileSurfaceClass(
                    home.unassigned,
                  )}`}
                >
                  <WardOrUnassignedContent tile={home.unassigned} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

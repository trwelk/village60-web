import type {
  OccupancyHeatmapBoardModel,
  OccupancyHeatmapHomeRow,
  OccupancyHeatmapWardTile,
} from "@/lib/dashboard/occupancyHeatmap";
import { buildOccupancyHeatmapWardResidentsQueryString } from "@/lib/residents/directoryPath";
import Link from "next/link";

type OccupancyHeatmapBoardCardProps = {
  board: OccupancyHeatmapBoardModel;
};

const legendItems: { key: string; className: string; label: string }[] = [
  { key: "g", className: "village-occ-legend village-occ-low", label: "0–69%" },
  { key: "a", className: "village-occ-legend village-occ-mid", label: "70–89%" },
  { key: "r", className: "village-occ-legend village-occ-high", label: "90–100%" },
  { key: "o", className: "village-occ-legend village-occ-over", label: ">100%" },
  { key: "n", className: "village-occ-legend village-occ-neutral-fill", label: "No beds" },
];

function pillBandClass(
  t: OccupancyHeatmapWardTile | { kind: "unassigned"; count: number },
): string {
  if (t.kind === "unassigned") return "village-occ-pill-unassigned";
  if (t.notConfigured) return "village-occ-pill-neutral";
  switch (t.band) {
    case "green":
      return "village-occ-pill-green";
    case "amber":
      return "village-occ-pill-amber";
    case "red":
      return "village-occ-pill-red";
    case "over":
      return "village-occ-pill-over";
    default:
      return "village-occ-pill-neutral";
  }
}

function WardPill({
  tile,
  homeId,
}: {
  tile: OccupancyHeatmapWardTile;
  homeId: string;
}) {
  const label = tile.notConfigured
    ? tile.label
    : `${tile.label} · ${tile.occupancyPercent}%`;
  const sub = tile.notConfigured
    ? "No beds"
    : `${tile.occupied}/${tile.bedCount}`;

  return (
    <Link
      href={`/dashboard/residents?${buildOccupancyHeatmapWardResidentsQueryString(homeId, tile.wardId)}`}
      className={`village-occ-pill ${pillBandClass(tile)}`}
      aria-label={`${tile.label}: ${tile.notConfigured ? "not configured" : `${tile.occupancyPercent}% occupancy, ${tile.occupied} of ${tile.bedCount} beds`}`}
    >
      <span className="village-occ-pill-label">{label}</span>
      <span className="village-occ-pill-sub">{sub}</span>
    </Link>
  );
}

function HomeSummary({ home }: { home: OccupancyHeatmapHomeRow }) {
  if (home.header.display === "configured") {
    const h = home.header;
    return (
      <span className="village-occ-home-summary tabular-nums">
        {h.occupied}/{h.configuredBeds} beds · {h.occupancyPercent}%
      </span>
    );
  }
  return (
    <span className="village-occ-home-summary village-occ-home-summary--muted">
      No bed counts
    </span>
  );
}

function HomeRow({ home }: { home: OccupancyHeatmapHomeRow }) {
  const hasWards = home.wardTiles.length > 0;
  return (
    <li className="village-occ-home-row">
      <div className="village-occ-home-header">
        <h3 className="village-occ-home-name">{home.homeName}</h3>
        <HomeSummary home={home} />
      </div>

      {home.homeNotice === "no_wards" ? (
        <p className="village-occ-notice">No wards configured</p>
      ) : home.homeNotice === "only_unconfigured" ? (
        <p className="village-occ-notice">All wards missing bed counts</p>
      ) : null}

      <div className="village-occ-pills">
        {hasWards
          ? home.wardTiles.map((t) => (
              <WardPill key={t.wardId} tile={t} homeId={home.homeId} />
            ))
          : null}
        {home.unassigned.count > 0 ? (
          <span className={`village-occ-pill ${pillBandClass(home.unassigned)}`}>
            <span className="village-occ-pill-label">
              Unassigned · {home.unassigned.count}
            </span>
          </span>
        ) : null}
      </div>
    </li>
  );
}

export function OccupancyHeatmapBoardCard({
  board,
}: OccupancyHeatmapBoardCardProps) {
  return (
    <section
      className="village-reveal village-occ-board"
      aria-labelledby="occupancy-heatmap-heading"
    >
      <div className="village-occ-board-header">
        <div className="village-occ-board-title-row">
          <h2
            id="occupancy-heatmap-heading"
            className="font-display text-lg font-normal tracking-tight text-pine-2"
          >
            Ward occupancy
          </h2>
          <ul
            className="village-occ-legend-row"
            aria-label="Occupancy color legend"
          >
            {legendItems.map((item) => (
              <li key={item.key} className="village-occ-legend-item">
                <span className={item.className} aria-hidden />
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="village-muted text-xs leading-relaxed sm:text-sm">
          Click a ward to view its residents. Non-archived sites only.
        </p>
      </div>

      {board.boardKind === "no_homes" ? (
        <p className="village-muted px-5 py-6 text-sm">
          No active homes. Add a home to see occupancy.
        </p>
      ) : (
        <ul className="village-occ-home-list">
          {board.homes.map((home) => (
            <HomeRow key={home.homeId} home={home} />
          ))}
        </ul>
      )}
    </section>
  );
}

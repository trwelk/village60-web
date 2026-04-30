"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { ResidentsPerHomeChartDatum } from "@/lib/dashboard/charts";
import { getHomeChartColor } from "./homeChartColors";

type ResidentsPerHomeChartProps = {
  data: ResidentsPerHomeChartDatum[];
};

type TooltipContentProps = {
  active?: boolean;
  payload?: Array<
    { payload: ResidentsPerHomeChartDatum } | ResidentsPerHomeChartDatum
  >;
  totalResidents: number;
};

function tooltipDatum(
  payload: TooltipContentProps["payload"],
): ResidentsPerHomeChartDatum | null {
  const first = payload?.[0];
  if (!first) return null;
  if (typeof first === "object" && "payload" in first && first.payload) {
    return first.payload;
  }
  if (
    typeof first === "object" &&
    "homeName" in first &&
    "residentCount" in first
  ) {
    return first as ResidentsPerHomeChartDatum;
  }
  return null;
}

export function ResidentsPerHomeTooltip({
  active,
  payload,
  totalResidents,
}: TooltipContentProps) {
  const entry = tooltipDatum(payload);
  if (!active || !entry) {
    return null;
  }
  const pct =
    totalResidents > 0
      ? Math.round((entry.residentCount / totalResidents) * 1000) / 10
      : 0;

  return (
    <div className="rounded-lg border border-pine/15 bg-cream px-3 py-2 shadow-lg">
      <p className="text-sm font-semibold text-pine-2">{entry.homeName}</p>
      <p className="text-sm text-ink">
        {entry.residentCount} resident{entry.residentCount === 1 ? "" : "s"}{" "}
        {totalResidents > 0 ? <span className="text-ink/70">({pct}%)</span> : null}
      </p>
    </div>
  );
}

export function ResidentsPerHomeChart({ data }: ResidentsPerHomeChartProps) {
  if (data.length === 0) {
    return <p className="village-muted mt-4">No active retirement homes yet.</p>;
  }

  const totalResidents = data.reduce((sum, d) => sum + d.residentCount, 0);

  return (
    <div className="mt-5">
      <div
        aria-label="Residents per home chart"
        className="h-[clamp(280px,38vw,360px)] w-full min-w-0"
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 4, right: 8, left: 8, bottom: 8 }}>
            <Tooltip
              content={
                <ResidentsPerHomeTooltip totalResidents={totalResidents} />
              }
              isAnimationActive={false}
            />
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 12, color: "#345246" }}
            />
            <Pie
              data={data}
              dataKey="residentCount"
              nameKey="homeName"
              cx="50%"
              cy="46%"
              innerRadius={0}
              outerRadius="58%"
              paddingAngle={1}
              stroke="#faf7f1"
              strokeWidth={1}
              isAnimationActive={false}
            >
              {data.map((entry, index) => (
                <Cell key={entry.homeId} fill={getHomeChartColor(index)} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>

      <dl className="sr-only">
        {data.map((entry) => (
          <div key={entry.homeId}>
            <dt>{entry.homeName}</dt>
            <dd>{entry.residentCount}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthEndCensusChartDatum } from "@/lib/dashboard/charts";
import { getHomeChartColor } from "./homeChartColors";

type MonthEndCensusChartProps = {
  data: MonthEndCensusChartDatum[];
};

type TooltipPayloadEntry = {
  color?: string;
  dataKey?: string | number;
  name?: string;
  value?: number;
};

type MonthEndCensusTooltipProps = {
  active?: boolean;
  label?: string;
  payload?: TooltipPayloadEntry[];
};

type ChartRow = {
  monthLabel: string;
  monthKey: string;
  [homeId: string]: number | string;
};

export function MonthEndCensusTooltip({
  active,
  label,
  payload,
}: MonthEndCensusTooltipProps) {
  const entries = payload?.filter(
    (entry): entry is TooltipPayloadEntry & { name: string; value: number } =>
      typeof entry.name === "string" && typeof entry.value === "number",
  );

  if (!active || !label || !entries || entries.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-pine/15 bg-cream px-3 py-2 shadow-lg">
      <p className="text-sm font-semibold text-pine-2">{label}</p>
      <ul className="mt-2 space-y-1">
        {entries.map((entry) => (
          <li
            key={`${entry.dataKey}-${entry.name}`}
            className="flex items-center justify-between gap-4 text-sm text-ink"
          >
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: entry.color ?? "#64748b" }}
              />
              <span>{entry.name}</span>
            </span>
            <span>{entry.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function buildChartRows(data: MonthEndCensusChartDatum[]): ChartRow[] {
  return data.map((month) => ({
    monthKey: month.monthKey,
    monthLabel: month.monthLabel,
    ...Object.fromEntries(
      month.homeCounts.map((homeCount) => [homeCount.homeId, homeCount.residentCount]),
    ),
  }));
}

export function MonthEndCensusChart({ data }: MonthEndCensusChartProps) {
  if (data.length === 0) {
    return <p className="village-muted mt-4">No month-end census data yet.</p>;
  }

  const homeSeries = data[0]?.homeCounts ?? [];
  const rows = buildChartRows(data);
  const maxResidentCount = Math.max(
    1,
    ...data.map((month) =>
      month.homeCounts.reduce((total, home) => total + home.residentCount, 0),
    ),
  );
  /** Round up to a 15-wide step so the top tick matches a round cap (e.g. 60, not 51). */
  const yAxisMax = Math.max(15, Math.ceil(maxResidentCount / 15) * 15);

  return (
    <div className="mt-5">
      <div
        aria-label="Month-end census by home chart"
        className="h-[clamp(250px,34vw,320px)] w-full min-w-0"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            margin={{ top: 10, right: 12, left: 0, bottom: 18 }}
          >
            <CartesianGrid stroke="#d9d1c3" vertical={false} />
            <XAxis
              dataKey="monthLabel"
              interval={0}
              tickLine={false}
              axisLine={{ stroke: "#b2aa9b" }}
              tick={{ fill: "#345246", fontSize: 12 }}
              tickMargin={8}
            />
            <YAxis
              allowDecimals={false}
              domain={[0, yAxisMax]}
              tickLine={false}
              axisLine={{ stroke: "#b2aa9b" }}
              tick={{ fill: "#5d5a53", fontSize: 12 }}
              width={36}
            />
            <Tooltip content={<MonthEndCensusTooltip />} cursor={false} />
            {homeSeries.map((home, index) => (
              <Bar
                key={home.homeId}
                dataKey={home.homeId}
                name={home.homeName}
                stackId="census"
                fill={getHomeChartColor(index)}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-ink/80">
        {homeSeries.map((home, index) => (
          <li key={home.homeId} className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: getHomeChartColor(index) }}
            />
            <span>{home.homeName}</span>
          </li>
        ))}
      </ul>

      <dl className="sr-only">
        {data.map((month) => (
          <div key={month.monthKey}>
            <dt>{month.monthLabel}</dt>
            <dd>
              {month.homeCounts
                .map((home) => `${home.homeName}: ${home.residentCount}`)
                .join(", ")}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

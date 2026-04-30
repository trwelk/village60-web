"use client";

import type { DemographicsKpis } from "@/lib/analytics/demographicsWorkload";
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Props = {
  kpis: DemographicsKpis;
};

const fillHist = "#14b8a6";

function KpiTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-pine/12 bg-cream/95 px-4 py-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
        {label}
      </p>
      <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-pine-2 sm:text-3xl">
        {value}
      </p>
      <div className="mt-2 text-xs">{sub}</div>
    </div>
  );
}

export function DemographicsSection({ kpis }: Props) {
  const sub =
    kpis.totalActiveResidents > 0 ? (
      <span className="text-ink/55 tabular-nums">
        {kpis.residents90PlusCount} of {kpis.totalActiveResidents}
        {kpis.residents90PlusSharePercent != null
          ? ` — ${kpis.residents90PlusSharePercent}%`
          : ""}
      </span>
    ) : (
      <span className="text-ink/55">No active residents in non-archived homes</span>
    );

  return (
    <section className="village-card space-y-6 bg-cream/88">
      <div>
        <h2 className="village-section-title">Demographics</h2>
        <p className="village-muted mt-1.5">
          Age bands for active residents (UTC date of birth; age as of UTC today).
        </p>
      </div>

      <div className="grid gap-4 sm:max-w-xs">
        <KpiTile
          label="Residents 90+"
          value={String(kpis.residents90PlusCount)}
          sub={sub}
        />
      </div>

      <div className="rounded-2xl border border-pine/12 bg-cream/90 px-3 py-5 sm:px-5">
        <h3 className="text-sm font-semibold text-pine-2">
          Age distribution (active residents)
        </h3>
        <div className="mt-4 h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={kpis.ageHistogram}
              margin={{ top: 8, right: 8, left: 4, bottom: 48 }}
            >
              <CartesianGrid
                stroke="color-mix(in srgb, var(--pine) 18%, transparent)"
                strokeDasharray="4 6"
                vertical={false}
              />
              <XAxis
                dataKey="bandLabel"
                interval={0}
                tick={{
                  fill: "var(--ink)",
                  fontSize: 11,
                  angle: -32,
                  textAnchor: "end",
                }}
                height={56}
              />
              <YAxis
                tick={{ fill: "var(--ink)", fontSize: 11 }}
                allowDecimals={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) {
                    return null;
                  }
                  const row = payload[0]?.payload as DemographicsKpis["ageHistogram"][number];
                  return (
                    <div className="max-w-xs rounded-lg border border-pine/20 bg-cream px-3 py-2 text-xs shadow-lg">
                      <p className="font-semibold text-pine-2">{row.bandLabel}</p>
                      <p className="mt-1 tabular-nums text-ink">
                        {row.count} resident
                        {row.count === 1 ? "" : "s"} ({row.sharePercent}%)
                      </p>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="count"
                fill={fillHist}
                radius={[6, 6, 0, 0]}
                minPointSize={2}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

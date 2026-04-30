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

const fillHist = "var(--accent)";

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
    <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_64%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-elevated)_97%,transparent),color-mix(in_srgb,var(--bg-muted)_86%,transparent))] px-4 py-4 shadow-[0_12px_24px_-22px_color-mix(in_srgb,var(--accent)_50%,transparent)]">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-[var(--text-primary)] sm:text-3xl">
        {value}
      </p>
      <div className="mt-2 text-xs">{sub}</div>
    </div>
  );
}

export function DemographicsSection({ kpis }: Props) {
  const sub =
    kpis.totalActiveResidents > 0 ? (
      <span className="text-[var(--text-muted)] tabular-nums">
        {kpis.residents90PlusCount} of {kpis.totalActiveResidents}
        {kpis.residents90PlusSharePercent != null
          ? ` — ${kpis.residents90PlusSharePercent}%`
          : ""}
      </span>
    ) : (
      <span className="text-[var(--text-muted)]">No active residents in non-archived homes</span>
    );

  return (
    <section className="village-card border border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-elevated)_94%,transparent),color-mix(in_srgb,var(--bg-muted)_88%,transparent))] p-4 shadow-[0_18px_46px_-34px_color-mix(in_srgb,var(--accent)_38%,transparent)] sm:p-6">
      <div className="space-y-6">
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

      <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_60%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_96%,transparent)] p-4 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--bg-canvas)_70%,transparent)] sm:p-5">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          Age distribution (active residents)
        </h3>
        <div className="mt-4 h-[320px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={kpis.ageHistogram}
              margin={{ top: 8, right: 16, left: 12, bottom: 58 }}
            >
              <CartesianGrid
                stroke="color-mix(in srgb, var(--line-strong) 50%, transparent)"
                strokeDasharray="4 6"
                vertical={false}
              />
              <XAxis
                dataKey="bandLabel"
                interval={0}
                padding={{ left: 8, right: 8 }}
                tick={{
                  fill: "var(--text-secondary)",
                  fontSize: 11,
                  angle: -32,
                  textAnchor: "end",
                }}
                height={56}
              />
              <YAxis
                tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
                allowDecimals={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) {
                    return null;
                  }
                  const row = payload[0]?.payload as DemographicsKpis["ageHistogram"][number];
                  return (
                    <div className="max-w-xs rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_64%,transparent)] bg-[var(--bg-elevated)] px-3 py-2 text-xs shadow-lg">
                      <p className="font-semibold text-[var(--text-primary)]">{row.bandLabel}</p>
                      <p className="mt-1 tabular-nums text-[var(--text-primary)]">
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
      </div>
    </section>
  );
}

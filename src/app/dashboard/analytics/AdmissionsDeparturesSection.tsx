"use client";

import type {
  AdmissionsDeparturesKpis,
  AdmissionsDeparturesMonthDatum,
  DepartureReasonBreakdown,
} from "@/lib/analytics/admissionsDepartures";
import { formatStayDurationFromDays } from "@/lib/analytics/admissionsDepartures";
import { getAnthropicChartPalette } from "@/lib/theme/anthropicTheme";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const piePalette = getAnthropicChartPalette("pie");

const fillAdmissions = "var(--chart-positive)";
const fillDepartures = "var(--highlight)";

const donutColors = piePalette.series;

type Props = {
  kpis: AdmissionsDeparturesKpis;
  twelveMonth: AdmissionsDeparturesMonthDatum[];
  reasonBreakdown: DepartureReasonBreakdown;
};

export function AdmissionsDeparturesSection({
  kpis,
  twelveMonth,
  reasonBreakdown,
}: Props) {
  const admDir =
    kpis.admissionsMomDelta > 0
      ? "up"
      : kpis.admissionsMomDelta < 0
        ? "down"
        : "flat";
  const depDir =
    kpis.departuresMomDelta > 0
      ? "up"
      : kpis.departuresMomDelta < 0
        ? "down"
        : "flat";

  const avgStayDisplay =
    kpis.avgLengthOfStayMedianDays == null
      ? "—"
      : formatStayDurationFromDays(kpis.avgLengthOfStayMedianDays);

  const pieData = reasonBreakdown.slices.map((s) => ({
    name: s.reason,
    value: s.count,
    percent: s.percent,
  }));

  const showReasonDonut = reasonBreakdown.distinctReasonCount >= 2;

  return (
    <section className="village-card border border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-elevated)_94%,transparent),color-mix(in_srgb,var(--bg-muted)_88%,transparent))] p-4 shadow-[0_18px_46px_-34px_color-mix(in_srgb,var(--accent)_35%,transparent)] sm:p-6">
      <div className="space-y-6">
        <div>
        <h2 className="village-section-title">Admissions & Departures</h2>
        <p className="village-muted mt-1.5">
          Monthly intake and exit counts, median length of stay for departed
          residents, and departure reasons (UTC calendar months).
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <KpiTile
          label="Admissions this month"
          value={String(kpis.admissionsThisMonth)}
          sub={
            <CountMonthOnMonthBadge
              delta={kpis.admissionsMomDelta}
              deltaPercent={kpis.admissionsMomDeltaPercent}
              direction={admDir}
            />
          }
        />
        <KpiTile
          label="Departures this month"
          value={String(kpis.departuresThisMonth)}
          sub={
            <CountMonthOnMonthBadge
              delta={kpis.departuresMomDelta}
              deltaPercent={kpis.departuresMomDeltaPercent}
              direction={depDir}
            />
          }
        />
        <KpiTile
          label="Avg. length of stay (median)"
          value={avgStayDisplay}
          sub={
            <span className="text-ink/55">
              Median days from admission to departure, all departed residents.
            </span>
          }
        />
      </div>

        <div className="grid gap-6">
          <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_60%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_96%,transparent)] p-4 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--bg-canvas)_70%,transparent)] sm:p-5">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Admissions (12 months, UTC)
          </h3>
          <div className="mt-4 h-[300px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={twelveMonth}
                margin={{ top: 8, right: 16, left: 16, bottom: 16 }}
              >
                <CartesianGrid
                  stroke="color-mix(in srgb, var(--line-strong) 50%, transparent)"
                  strokeDasharray="4 6"
                />
                <XAxis
                  dataKey="monthLabelShort"
                  tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                  tickLine={false}
                  padding={{ left: 8, right: 8 }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
                  tickLine={false}
                  width={56}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) {
                      return null;
                    }
                    const adm = payload.find((p) => p.dataKey === "admissions");
                    const dep = payload.find((p) => p.dataKey === "departures");
                    return (
                      <div className="rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_64%,transparent)] bg-[var(--bg-elevated)] px-3 py-2 text-xs shadow-lg">
                        <p className="font-semibold text-[var(--text-primary)]">{label}</p>
                        {adm != null && (
                          <p className="mt-1 tabular-nums text-[var(--text-primary)]">
                            Admissions: {String(adm.value)}
                          </p>
                        )}
                        {dep != null && (
                          <p className="tabular-nums text-[var(--text-primary)]">
                            Departures: {String(dep.value)}
                          </p>
                        )}
                      </div>
                    );
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={24}
                  wrapperStyle={{ fontSize: "12px" }}
                />
                <Bar dataKey="admissions" name="Admissions" fill={fillAdmissions} />
                <Bar dataKey="departures" name="Departures" fill={fillDepartures} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

          <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_60%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_96%,transparent)] p-4 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--bg-canvas)_70%,transparent)] sm:p-5">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Departure reasons (last 12 months, UTC)
          </h3>
          {!showReasonDonut ? (
            <div className="mt-6 flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-[color:color-mix(in_srgb,var(--line-strong)_54%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_76%,transparent)] px-4 py-10 text-center text-sm text-[var(--text-muted)]">
              <p>
                At least two distinct departure reasons in the last twelve months
                are required for a breakdown chart. Currently{" "}
                {reasonBreakdown.distinctReasonCount === 0
                  ? "there are no departures"
                  : "only one reason category is recorded"}
                .
              </p>
            </div>
          ) : (
            <div className="mt-4 h-[320px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={68}
                    outerRadius={100}
                    paddingAngle={1}
                  >
                    {pieData.map((_, i) => (
                      <Cell
                        key={String(i)}
                        fill={donutColors[i % donutColors.length]!}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) {
                        return null;
                      }
                      const row = payload[0]?.payload as {
                        name: string;
                        value: number;
                        percent: number;
                      };
                      return (
                        <div className="max-w-xs rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_64%,transparent)] bg-[var(--bg-elevated)] px-3 py-2 text-xs shadow-lg">
                          <p className="font-semibold text-[var(--text-primary)]">{row.name}</p>
                          <p className="mt-1 tabular-nums text-[var(--text-primary)]">
                            Count: {row.value}
                          </p>
                          <p className="tabular-nums text-[var(--text-secondary)]">
                            Share: {row.percent}%
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Legend
                    layout="horizontal"
                    align="center"
                    verticalAlign="bottom"
                    wrapperStyle={{ fontSize: "12px", paddingTop: "6px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
      </div>
    </section>
  );
}

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
    <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_64%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-elevated)_97%,transparent),color-mix(in_srgb,var(--bg-muted)_86%,transparent))] p-4 shadow-[0_12px_24px_-22px_color-mix(in_srgb,var(--highlight)_50%,transparent)]">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--text-primary)] sm:text-3xl">
        {value}
      </p>
      <div className="mt-2 text-xs">{sub}</div>
    </div>
  );
}

function CountMonthOnMonthBadge({
  delta,
  deltaPercent,
  direction,
}: {
  delta: number;
  deltaPercent: number | null;
  direction: "up" | "down" | "flat";
}) {
  const Icon =
    direction === "up"
      ? TrendingUp
      : direction === "down"
        ? TrendingDown
        : Minus;
  const colorClass =
    direction === "up"
      ? "text-[var(--success)]"
      : direction === "down"
        ? "text-[var(--highlight)]"
        : "text-[var(--text-muted)]";

  return (
    <span
      className={`inline-flex flex-wrap items-center gap-1.5 tabular-nums ${colorClass}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        {deltaPercent != null
          ? `${deltaPercent > 0 ? "+" : ""}${deltaPercent}%`
          : delta === 0
            ? "0%"
            : "—"}
      </span>
      <span className="text-[var(--text-muted)]">
        ({delta > 0 ? "+" : ""}
        {delta} vs prior month)
      </span>
    </span>
  );
}

"use client";

import type {
  AdmissionsDeparturesKpis,
  AdmissionsDeparturesMonthDatum,
  DepartureReasonBreakdown,
} from "@/lib/analytics/admissionsDepartures";
import { formatStayDurationFromDays } from "@/lib/analytics/admissionsDepartures";
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

const fillAdmissions = "#22d3ee";
const fillDepartures = "#fb923c";

const donutColors = [
  "#22d3ee",
  "#fb923c",
  "#34d399",
  "#c084fc",
  "#f472b6",
  "#818cf8",
];

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
    <section className="village-card space-y-6 bg-cream/88">
      <div>
        <h2 className="village-section-title">Admissions & Departures</h2>
        <p className="village-muted mt-1.5">
          Monthly intake and exit counts, median length of stay for departed
          residents, and departure reasons (UTC calendar months).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
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

      <div className="grid gap-8 lg:grid-cols-1">
        <div className="rounded-2xl border border-pine/12 bg-cream/90 px-3 py-5 sm:px-5">
          <h3 className="text-sm font-semibold text-pine-2">
            Admissions & departures (12 months, UTC)
          </h3>
          <div className="mt-4 h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={twelveMonth}
                margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
              >
                <CartesianGrid
                  stroke="color-mix(in srgb, var(--pine) 18%, transparent)"
                  strokeDasharray="4 6"
                />
                <XAxis
                  dataKey="monthLabelShort"
                  tick={{ fill: "var(--ink)", fontSize: 12 }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "var(--ink)", fontSize: 11 }}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) {
                      return null;
                    }
                    const adm = payload.find((p) => p.dataKey === "admissions");
                    const dep = payload.find((p) => p.dataKey === "departures");
                    return (
                      <div className="rounded-lg border border-pine/20 bg-cream px-3 py-2 text-xs shadow-lg">
                        <p className="font-semibold text-pine-2">{label}</p>
                        {adm != null && (
                          <p className="mt-1 tabular-nums text-ink">
                            Admissions: {String(adm.value)}
                          </p>
                        )}
                        {dep != null && (
                          <p className="tabular-nums text-ink">
                            Departures: {String(dep.value)}
                          </p>
                        )}
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Bar dataKey="admissions" name="Admissions" fill={fillAdmissions} />
                <Bar dataKey="departures" name="Departures" fill={fillDepartures} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-pine/12 bg-cream/90 px-3 py-5 sm:px-5">
          <h3 className="text-sm font-semibold text-pine-2">
            Departure reasons (last 12 months, UTC)
          </h3>
          {!showReasonDonut ? (
            <div className="mt-6 flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-pine/20 bg-pine-soft/25 px-4 py-10 text-center text-sm text-ink/55">
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
            <div className="mt-4 h-[300px] w-full">
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
                        <div className="max-w-xs rounded-lg border border-pine/20 bg-cream px-3 py-2 text-xs shadow-lg">
                          <p className="font-semibold text-pine-2">{row.name}</p>
                          <p className="mt-1 tabular-nums text-ink">
                            Count: {row.value}
                          </p>
                          <p className="tabular-nums text-ink/80">
                            Share: {row.percent}%
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Legend
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                    wrapperStyle={{ fontSize: "12px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
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
      ? "text-emerald-700"
      : direction === "down"
        ? "text-terracotta"
        : "text-ink/55";

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
      <span className="text-ink/50">
        ({delta > 0 ? "+" : ""}
        {delta} vs prior month)
      </span>
    </span>
  );
}

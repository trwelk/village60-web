"use client";

import type {
  AdmissionsDeparturesKpis,
  AdmissionsDeparturesMonthDatum,
} from "@/lib/analytics/admissionsDepartures";
import { formatStayDurationFromDays } from "@/lib/analytics/admissionsDepartures";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const fillAdmissions = "var(--chart-positive)";
const fillDepartures = "var(--highlight)";

type Props = {
  kpis: AdmissionsDeparturesKpis;
  twelveMonth: AdmissionsDeparturesMonthDatum[];
};

export function AdmissionsDeparturesSection({
  kpis,
  twelveMonth,
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

  return (
    <section className="village-card border border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-elevated)_94%,transparent),color-mix(in_srgb,var(--bg-muted)_88%,transparent))] p-4 shadow-[0_18px_46px_-34px_color-mix(in_srgb,var(--accent)_35%,transparent)] sm:p-6">
      <div className="space-y-6">
        <div>
          <h2 className="village-section-title">Admissions & Departures</h2>
          <p className="village-muted mt-1.5">
            Monthly intake and exit counts and median length of stay for
            departed residents (UTC calendar months).
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

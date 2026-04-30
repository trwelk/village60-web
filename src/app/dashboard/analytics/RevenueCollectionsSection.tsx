"use client";

import type {
  BilledVsCollectedMonthDatum,
  PaymentLagByHomeDatum,
  RevenueKpis,
} from "@/lib/analytics/revenueCollections";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Props = {
  currencyCode: string;
  kpis: RevenueKpis;
  billedVsCollected: BilledVsCollectedMonthDatum[];
  paymentLag: PaymentLagByHomeDatum[];
};

function formatMinorAsCurrency(minor: number, currencyCode: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currencyCode,
  }).format(minor / 100);
}

const strokeBilled = "#22d3ee";
const strokeCollected = "#c084fc";

export function RevenueCollectionsSection({
  currencyCode,
  kpis,
  billedVsCollected,
  paymentLag,
}: Props) {
  const momDirection =
    kpis.momDeltaMinor > 0
      ? "up"
      : kpis.momDeltaMinor < 0
        ? "down"
        : "flat";

  const formatAxisMinor = (v: number) =>
    formatMinorAsCurrency(v, currencyCode);

  const barHeight = Math.max(220, paymentLag.length * 44);

  return (
    <section className="village-card space-y-6 bg-cream/88">
      <div>
        <h2 className="village-section-title">Revenue & Collections</h2>
        <p className="village-muted mt-1.5">
          Monthly billed vs collected, collection rate, outstanding balance, and
          payment lag by home. Figures in {currencyCode}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiTile
          label="Monthly billed"
          value={formatMinorAsCurrency(
            kpis.monthlyBilledMinor,
            currencyCode,
          )}
          sub={
            <MonthOnMonthBadge
              currencyCode={currencyCode}
              deltaMinor={kpis.momDeltaMinor}
              deltaPercent={kpis.momDeltaPercent}
              direction={momDirection}
            />
          }
        />
        <KpiTile
          label="Collection rate"
          value={
            kpis.collectionRatePercent != null
              ? `${kpis.collectionRatePercent}%`
              : "—"
          }
          sub={
            <span className="text-ink/55">
              Current month ({kpis.billingMonthCurrent})
            </span>
          }
        />
        <KpiTile
          label="Outstanding balance"
          value={formatMinorAsCurrency(
            kpis.outstandingUnpaidMinor,
            currencyCode,
          )}
          sub={
            <span className="text-ink/55">All unpaid monthly charges</span>
          }
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-1">
        <div className="rounded-2xl border border-pine/12 bg-cream/90 px-3 py-5 sm:px-5">
          <h3 className="text-sm font-semibold text-pine-2">
            Billed vs collected (12 months, UTC)
          </h3>
          <div className="mt-4 h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={billedVsCollected}
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
                  tickFormatter={(v) => formatAxisMinor(v)}
                  tick={{ fill: "var(--ink)", fontSize: 11 }}
                  tickLine={false}
                  width={72}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) {
                      return null;
                    }
                    const billed = payload.find(
                      (p) => p.dataKey === "billedMinor",
                    );
                    const collected = payload.find(
                      (p) => p.dataKey === "collectedMinor",
                    );
                    return (
                      <div className="rounded-lg border border-pine/20 bg-cream px-3 py-2 text-xs shadow-lg">
                        <p className="font-semibold text-pine-2">{label}</p>
                        {billed != null && (
                          <p className="mt-1 tabular-nums text-ink">
                            Billed:{" "}
                            {formatMinorAsCurrency(
                              Number(billed.value),
                              currencyCode,
                            )}
                          </p>
                        )}
                        {collected != null && (
                          <p className="tabular-nums text-ink">
                            Collected:{" "}
                            {formatMinorAsCurrency(
                              Number(collected.value),
                              currencyCode,
                            )}
                          </p>
                        )}
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Line
                  type="monotone"
                  dataKey="billedMinor"
                  name="Billed"
                  stroke={strokeBilled}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="collectedMinor"
                  name="Collected"
                  stroke={strokeCollected}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-pine/12 bg-cream/90 px-3 py-5 sm:px-5">
          <h3 className="text-sm font-semibold text-pine-2">
            Payment lag by home (avg. days after month-end)
          </h3>
          <p className="mt-1 text-xs text-ink/55">
            Non-archived homes only. Homes with no recorded payments show 0 days.
          </p>
          <div className="mt-4 w-full" style={{ height: barHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={paymentLag}
                margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
              >
                <CartesianGrid
                  stroke="color-mix(in srgb, var(--pine) 18%, transparent)"
                  strokeDasharray="4 6"
                  horizontal
                />
                <XAxis
                  type="number"
                  tick={{ fill: "var(--ink)", fontSize: 11 }}
                  allowDecimals
                />
                <YAxis
                  type="category"
                  dataKey="homeName"
                  width={140}
                  tick={{ fill: "var(--ink)", fontSize: 11 }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) {
                      return null;
                    }
                    const row = payload[0]?.payload as PaymentLagByHomeDatum;
                    return (
                      <div className="max-w-xs rounded-lg border border-pine/20 bg-cream px-3 py-2 text-xs shadow-lg">
                        <p className="font-semibold text-pine-2">{row.homeName}</p>
                        <p className="mt-1 tabular-nums text-ink">
                          Avg. lag: {row.averageLagDays} days
                        </p>
                        {!row.hasPayments && (
                          <p className="mt-1 text-ink/65">
                            No payments recorded for this home.
                          </p>
                        )}
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="averageLagDays"
                  fill={strokeCollected}
                  radius={[0, 6, 6, 0]}
                />
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

function MonthOnMonthBadge({
  currencyCode,
  deltaMinor,
  deltaPercent,
  direction,
}: {
  currencyCode: string;
  deltaMinor: number;
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
          : deltaMinor === 0
            ? "0%"
            : "—"}
      </span>
      <span className="text-ink/50">
        (
        {deltaMinor > 0 ? "+" : ""}
        {formatMinorAsCurrency(deltaMinor, currencyCode)} vs prior month)
      </span>
    </span>
  );
}

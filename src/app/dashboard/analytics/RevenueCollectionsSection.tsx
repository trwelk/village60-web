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

const strokeBilled = "var(--accent)";
const strokeCollected = "var(--accent-strong)";

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
    <section className="village-card border border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-elevated)_94%,transparent),color-mix(in_srgb,var(--bg-muted)_88%,transparent))] p-4 shadow-[0_18px_46px_-34px_color-mix(in_srgb,var(--accent)_40%,transparent)] sm:p-6">
      <div className="space-y-6">
        <div>
        <h2 className="village-section-title">Revenue & Collections</h2>
        <p className="village-muted mt-1.5">
          Monthly billed vs collected, collection rate, outstanding balance, and
          payment lag by home. Figures in {currencyCode}.
        </p>
      </div>

        <div className="grid gap-4 lg:grid-cols-3">
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
              <span className="text-[var(--text-muted)]">
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
              <span className="text-[var(--text-muted)]">
                All unpaid monthly charges
              </span>
            }
          />
        </div>

        <div className="grid gap-6">
          <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_60%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_96%,transparent)] p-4 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--bg-canvas)_70%,transparent)] sm:p-5">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Billed vs collected (12 months, UTC)
            </h3>
            <div className="mt-4 h-[300px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={billedVsCollected}
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
                    tickFormatter={(v) => formatAxisMinor(v)}
                    tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
                    tickLine={false}
                    width={96}
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
                        <div className="max-w-xs rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_64%,transparent)] bg-[var(--bg-elevated)] px-3 py-2 text-xs shadow-lg">
                          <p className="font-semibold text-[var(--text-primary)]">
                            {label}
                          </p>
                          {billed != null && (
                            <p className="mt-1 tabular-nums text-[var(--text-primary)]">
                              Billed:{" "}
                              {formatMinorAsCurrency(
                                Number(billed.value),
                                currencyCode,
                              )}
                            </p>
                          )}
                          {collected != null && (
                            <p className="tabular-nums text-[var(--text-primary)]">
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
                  <Legend
                    verticalAlign="bottom"
                    height={24}
                    wrapperStyle={{ fontSize: "12px" }}
                  />
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

          <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_60%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_96%,transparent)] p-4 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--bg-canvas)_70%,transparent)] sm:p-5">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Payment lag by home (avg. days after month-end)
            </h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Non-archived homes only. Homes with no recorded payments show 0
              days.
            </p>
            <div className="mt-4 w-full min-w-0" style={{ height: barHeight }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={paymentLag}
                  margin={{ top: 4, right: 20, left: 16, bottom: 4 }}
                >
                  <CartesianGrid
                    stroke="color-mix(in srgb, var(--line-strong) 50%, transparent)"
                    strokeDasharray="4 6"
                    horizontal
                  />
                  <XAxis
                    type="number"
                    tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
                    allowDecimals
                  />
                  <YAxis
                    type="category"
                    dataKey="homeName"
                    width={164}
                    tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) {
                        return null;
                      }
                      const row = payload[0]?.payload as PaymentLagByHomeDatum;
                      return (
                        <div className="max-w-xs rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_64%,transparent)] bg-[var(--bg-elevated)] px-3 py-2 text-xs shadow-lg">
                          <p className="font-semibold text-[var(--text-primary)]">
                            {row.homeName}
                          </p>
                          <p className="mt-1 tabular-nums text-[var(--text-primary)]">
                            Avg. lag: {row.averageLagDays} days
                          </p>
                          {!row.hasPayments && (
                            <p className="mt-1 text-[var(--text-muted)]">
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
    <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_64%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-elevated)_97%,transparent),color-mix(in_srgb,var(--bg-muted)_86%,transparent))] p-4 shadow-[0_12px_24px_-22px_color-mix(in_srgb,var(--accent)_55%,transparent)]">
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
          : deltaMinor === 0
            ? "0%"
            : "—"}
      </span>
      <span className="text-[var(--text-muted)]">
        (
        {deltaMinor > 0 ? "+" : ""}
        {formatMinorAsCurrency(deltaMinor, currencyCode)} vs prior month)
      </span>
    </span>
  );
}

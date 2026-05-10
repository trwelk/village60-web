"use client";

import { VillageSelect } from "@/components/VillageSelect";
import type {
  ExpenseAnalyticsSnapshot,
  FinancialAnalyticsSnapshot,
  FinancialPreset,
} from "@/lib/analytics/financialOverview";
import { getVillage60ChartPalette, resolveVillage60Theme } from "@/lib/theme/village60Theme";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type HomeOpt = { homeId: string; homeName: string };

export type FinancialAnalyticsClientProps = {
  financial: FinancialAnalyticsSnapshot;
  expenses: ExpenseAnalyticsSnapshot;
  homeOptions: HomeOpt[];
  selectedHomeKey: string;
  preset: FinancialPreset;
};

function financialHref(preset: FinancialPreset, home: string): string {
  const params = new URLSearchParams();
  params.set("preset", preset);
  params.set("home", home);
  return `/dashboard/analytics/financial?${params.toString()}`;
}

function formatMinorAsCurrency(minor: number, currencyCode: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currencyCode,
  }).format(minor / 100);
}

/**
 * Financial chart colors follow the active theme (`village60Theme.ts`) so Recharts
 * fills stay aligned with dashboard tokens.
 */
function buildFinancialChartColors() {
  const core = resolveVillage60Theme().core;
  const pie = getVillage60ChartPalette("pie");
  return {
    /** Resident collections, totals marked “paid” */
    collected: pie.positive,
    /** Home expenses / outflows */
    expenses: core["--chart-categorical-4"],
    /** Outstanding / owed slices */
    owed: pie.negative,
    /** Primary cumulative line */
    netLine: core["--accent-strong"],
    /** Secondary cumulative line (dashed) */
    potentialLine: pie.neutral,
    /** Draft / low-emphasis bars */
    invoiceDraft: core["--line-subtle"],
    /** Finalized invoice bars */
    invoiceFinalized: core["--chart-categorical-2"],
    /** Distinct slices for category pies (cycles if needed) */
    categoryCycle: pie.series,
  };
}

const FIN_CHART = buildFinancialChartColors();

const RESIDENT_PAID_FILL = FIN_CHART.collected;
const RESIDENT_OWED_FILL = FIN_CHART.owed;

export function FinancialAnalyticsClient({
  financial,
  expenses,
  homeOptions,
  selectedHomeKey,
  preset,
}: FinancialAnalyticsClientProps) {
  const router = useRouter();
  const [tab, setTab] = useState<"overview" | "revenue" | "expenses">(
    "overview",
  );
  const [filtersOpen, setFiltersOpen] = useState(true);

  const presetOptions = useMemo(
    () => [
      { value: "6" as const, label: "Last 6 months" },
      { value: "12" as const, label: "Last 12 months" },
      { value: "ytd" as const, label: "Year to date (UTC)" },
    ],
    [],
  );

  const homeSelectOptions = useMemo(
    () => [
      { value: "all", label: "All homes" },
      ...homeOptions.map((h) => ({
        value: h.homeId,
        label: h.homeName,
      })),
    ],
    [homeOptions],
  );

  const onPresetChange = useCallback(
    (next: string) => {
      const p: FinancialPreset =
        next === "6" ? "6" : next === "ytd" ? "ytd" : "12";
      router.push(financialHref(p, selectedHomeKey));
    },
    [router, selectedHomeKey],
  );

  const onHomeChange = useCallback(
    (next: string) => {
      router.push(financialHref(preset, next === "" ? "all" : next));
    },
    [router, preset],
  );

  const exportCsv = useCallback(() => {
    const rows: string[][] = [
      ["Financial analytics export"],
      ["Range", `${financial.startMonth} → ${financial.endMonth}`],
      ["Currency", financial.currencyCode],
      ["Preset", preset],
      ["Home filter", selectedHomeKey],
      [],
      ["KPI", "Amount minor"],
      ["Total collected", String(financial.kpis.totalCollectedMinor)],
      [
        "Total home expenses",
        String(financial.kpis.totalExpensesMinor),
      ],
      ["Net (collected − home expenses)", String(financial.kpis.netMinor)],
      [
        "Outstanding receivables (resident balances > 0)",
        String(financial.kpis.outstandingReceivablesMinor),
      ],
      [],
      ["Home expenses total", String(expenses.totalExpensesMinor)],
    ];
    const csv = rows.map((r) => r.map(escapeCsvCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financial-analytics-${financial.startMonth}-${financial.endMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [expenses.totalExpensesMinor, financial, preset, selectedHomeKey]);

  const fmt = (v: number) =>
    formatMinorAsCurrency(v, financial.currencyCode);

  const rangeTitle = `${financial.startMonth} → ${financial.endMonth}`;

  const activePresetLabel =
    presetOptions.find((o) => o.value === preset)?.label ?? preset;
  const activeHomeLabel =
    homeSelectOptions.find((o) => o.value === selectedHomeKey)?.label ??
    selectedHomeKey;

  return (
    <div className="flex flex-col gap-8 text-[var(--text-primary)]">
      <section className="village-card village-reveal rounded-3xl border border-[color:color-mix(in_srgb,var(--line-strong)_56%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] p-5 shadow-[0_18px_46px_-34px_color-mix(in_srgb,var(--accent)_35%,transparent)] sm:p-6">
        <div className="flex flex-col gap-5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="font-display text-xl font-semibold tracking-tight">
              Billing & revenue analytics
            </h2>
            <button
              type="button"
              id="financial-analytics-filters-toggle"
              aria-expanded={filtersOpen}
              aria-controls="financial-analytics-filter-panel"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_60%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_85%,transparent)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)] shadow-sm transition hover:border-[color:color-mix(in_srgb,var(--accent)_45%,transparent)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <ChevronDown
                className={[
                  "size-3.5 shrink-0 text-[var(--text-muted)] transition-transform duration-200",
                  filtersOpen ? "-rotate-180" : "",
                ].join(" ")}
                aria-hidden
              />
              {filtersOpen ? "Hide filters" : "Filters"}
            </button>
          </div>

          <div
            id="financial-analytics-filter-panel"
            role="region"
            aria-labelledby="financial-analytics-filters-toggle"
            className="flex flex-col gap-5"
            hidden={!filtersOpen}
          >
            <div className="flex flex-col gap-5 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
              <div className="space-y-1">
                <p className="max-w-2xl text-sm text-[var(--text-muted)]">
                  Resident collections, home expenses (not invoice totals),
                  invoicing shown for context, and balances — scoped by UTC
                  billing months. Figures in {financial.currencyCode}.
                </p>
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  {rangeTitle}
                </p>
              </div>
              <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
                <label className="flex min-w-[12rem] flex-col gap-2 text-sm">
                  <span className="village-label">Period</span>
                  <VillageSelect
                    value={preset}
                    onChange={onPresetChange}
                    options={presetOptions.map((o) => ({
                      value: o.value,
                      label: o.label,
                    }))}
                  />
                </label>
                <label className="flex min-w-[14rem] flex-col gap-2 text-sm">
                  <span className="village-label">Home</span>
                  <VillageSelect
                    value={selectedHomeKey}
                    onChange={onHomeChange}
                    options={homeSelectOptions}
                  />
                </label>
                <button
                  type="button"
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-[color:color-mix(in_srgb,var(--line-strong)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_88%,transparent)] px-4 text-sm font-semibold text-[var(--text-primary)] shadow-sm transition hover:border-[color:color-mix(in_srgb,var(--accent)_54%,transparent)] focus-visible:outline focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]"
                  onClick={exportCsv}
                >
                  Export CSV
                </button>
              </div>
            </div>
          </div>

          {!filtersOpen ? (
            <p className="text-sm text-[var(--text-muted)]">
              <span className="font-medium text-[var(--text-secondary)]">
                {activePresetLabel}
              </span>
              <span aria-hidden className="mx-1.5 text-[var(--line-strong)]">
                ·
              </span>
              <span className="font-medium text-[var(--text-secondary)]">
                {activeHomeLabel}
              </span>
              <span aria-hidden className="mx-1.5 text-[var(--line-strong)]">
                ·
              </span>
              <span>{rangeTitle}</span>
            </p>
          ) : null}
        </div>

        <div
          className="mt-6 flex flex-wrap gap-2 border-t border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] pt-6"
          role="tablist"
          aria-label="Financial analytics sections"
        >
          {(
            [
              ["overview", "Overview"],
              ["revenue", "Revenue"],
              ["expenses", "Home Expenses"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={[
                "rounded-xl px-4 py-2 text-sm font-semibold transition",
                tab === id
                  ? "bg-[color:color-mix(in_srgb,var(--accent)_22%,transparent)] text-[var(--text-primary)] ring-2 ring-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]"
                  : "text-[var(--text-secondary)] hover:bg-[color:color-mix(in_srgb,var(--bg-muted)_90%,transparent)] hover:text-[var(--text-primary)]",
              ].join(" ")}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {tab === "overview" ? (
        <OverviewTab financial={financial} fmt={fmt} />
      ) : null}
      {tab === "revenue" ? (
        <RevenueTab financial={financial} fmt={fmt} />
      ) : null}
      {tab === "expenses" ? (
        <ExpensesTab expenses={expenses} fmt={fmt} />
      ) : null}
    </div>
  );
}

function escapeCsvCell(v: string): string {
  if (/[",\r\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function OverviewTab({
  financial,
  fmt,
}: {
  financial: FinancialAnalyticsSnapshot;
  fmt: (n: number) => string;
}) {
  const strokeCollected = FIN_CHART.collected;
  const strokeExpenses = FIN_CHART.expenses;
  const strokeNet = FIN_CHART.netLine;
  const strokePotentialNet = FIN_CHART.potentialLine;

  const cashFlowChartData = financial.monthlyCashFlow.map((m) => ({
    ...m,
    expensesBarMinor: m.expensesMinor,
  }));
  const residentOwedVsPaidData = [
    {
      label: "Total paid",
      amountMinor: financial.kpis.totalCollectedMinor,
      fill: RESIDENT_PAID_FILL,
    },
    {
      label: "Total owed",
      amountMinor: financial.kpis.outstandingReceivablesMinor,
      fill: RESIDENT_OWED_FILL,
    },
  ].filter((r) => r.amountMinor > 0);

  const invoiceDraftTotal = financial.invoiceVolumeByStatusMonth.reduce(
    (s, m) => s + m.draftMinor,
    0,
  );
  const invoiceFinalizedTotal = financial.invoiceVolumeByStatusMonth.reduce(
    (s, m) => s + m.finalizedMinor,
    0,
  );
  const invoiceStatusPieData = [
    {
      label: "Draft",
      amountMinor: invoiceDraftTotal,
      fill: FIN_CHART.invoiceDraft,
    },
    {
      label: "Finalized",
      amountMinor: invoiceFinalizedTotal,
      fill: FIN_CHART.invoiceFinalized,
    },
  ].filter((r) => r.amountMinor > 0);
  const invoiceIssuedTotalMinor = invoiceDraftTotal + invoiceFinalizedTotal;

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Resident collections (period)"
          value={fmt(financial.kpis.totalCollectedMinor)}
        />
        <KpiCard
          label="Home Expenses (period)"
          value={fmt(financial.kpis.totalExpensesMinor)}
          hint="Payments on home billing accounts by received date"
        />
        <KpiCard
          label="Net cash (collected − home expenses)"
          value={fmt(financial.kpis.netMinor)}
        />
        <KpiCard
          label="Outstanding receivables"
          value={fmt(financial.kpis.outstandingReceivablesMinor)}
          hint="Sum of resident account balances above zero"
        />
      </section>

      <ChartCard
        title="Cash activity by month"
        subtitle="Bars: resident collections vs home expenses each UTC month (by payment received date). Lines use cumulative resident collections minus cumulative home expenses."
      >
        <div className="mt-4 h-[320px] w-full min-w-0">
          {financial.monthlyCashFlow.some(
            (m) => m.collectedMinor > 0 || m.expensesMinor > 0,
          ) ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={cashFlowChartData}
                margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
              >
                <CartesianGrid
                  stroke="color-mix(in srgb, var(--line-strong) 50%, transparent)"
                  strokeDasharray="4 6"
                />
                <XAxis
                  dataKey="monthLabelShort"
                  tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => fmt(v)}
                  tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
                  width={88}
                  tickLine={false}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) {
                      return null;
                    }
                    const datum =
                      typeof label === "string"
                        ? cashFlowChartData.find(
                            (d) => d.monthLabelShort === label,
                          )
                        : undefined;

                    const titles: Record<string, string> = {
                      collectedMinor: "Collected (this month)",
                      expensesBarMinor: "Home Expenses (this month)",
                      cumNetCashMinor:
                        "Cumulative net (collected − home expenses)",
                      cumPotentialNetMinor:
                        "Cumulative potential (net + outstanding)",
                    };

                    const monthlyOrder = ["collectedMinor", "expensesBarMinor"];
                    const cumOrder = [
                      "cumNetCashMinor",
                      "cumPotentialNetMinor",
                    ];

                    const monthlyPart = payload
                      .filter((p) =>
                        monthlyOrder.includes(String(p.dataKey)),
                      )
                      .sort(
                        (a, b) =>
                          monthlyOrder.indexOf(String(a.dataKey)) -
                          monthlyOrder.indexOf(String(b.dataKey)),
                      );
                    const cumPart = payload
                      .filter((p) => cumOrder.includes(String(p.dataKey)))
                      .sort(
                        (a, b) =>
                          cumOrder.indexOf(String(a.dataKey)) -
                          cumOrder.indexOf(String(b.dataKey)),
                      );

                    const renderRow = (p: (typeof payload)[number]) => {
                      const key = String(p.dataKey);
                      const raw = Number(p.value);
                      return (
                        <p key={key} className="tabular-nums">
                          {titles[key] ?? p.name}: {fmt(raw)}
                        </p>
                      );
                    };

                    return (
                      <div className="max-w-xs rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_64%,transparent)] bg-[var(--bg-elevated)] px-3 py-2 text-xs shadow-lg">
                        <p className="font-semibold">{label}</p>
                        {monthlyPart.map(renderRow)}
                        {cumPart.map(renderRow)}
                        {datum ? (
                          <p className="mt-1 border-t border-[color:color-mix(in_srgb,var(--line-subtle)_55%,transparent)] pt-1 tabular-nums text-[0.65rem] leading-snug text-[var(--text-muted)]">
                            Invoiced finalized (issued this month; not subtracted
                            in bars): {fmt(datum.finalizedInvoicedMinor)}
                          </p>
                        ) : null}
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Bar
                  dataKey="collectedMinor"
                  name="Collected"
                  fill={strokeCollected}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                />
                <Bar
                  dataKey="expensesBarMinor"
                  name="Home Expenses"
                  fill={strokeExpenses}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                />
                <Line
                  type="monotone"
                  dataKey="cumNetCashMinor"
                  name="Cumulative net"
                  stroke={strokeNet}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="cumPotentialNetMinor"
                  name="Cumulative potential (+ outstanding)"
                  stroke={strokePotentialNet}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </div>
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Residents: total owed vs paid"
          subtitle="Paid = resident collections in the selected period; owed = current outstanding resident receivables"
        >
          <div className="mt-4 h-[280px] w-full min-w-0">
            {residentOwedVsPaidData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={residentOwedVsPaidData}
                    dataKey="amountMinor"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={96}
                    paddingAngle={2}
                  >
                    {residentOwedVsPaidData.map((row, i) => (
                      <Cell key={`resident-balance-${i}`} fill={row.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) {
                        return null;
                      }
                      const p = payload[0]?.payload as {
                        label: string;
                        amountMinor: number;
                      };
                      return (
                        <div className="rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_64%,transparent)] bg-[var(--bg-elevated)] px-3 py-2 text-xs shadow-lg">
                          <p className="font-semibold">{p.label}</p>
                          <p className="tabular-nums">{fmt(p.amountMinor)}</p>
                        </div>
                      );
                    }}
                  />
                  <Legend verticalAlign="bottom" layout="horizontal" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </ChartCard>

        <ChartCard
          title="Invoice totals by status"
          subtitle="Draft vs finalized snapshot totals on invoices issued in this period (aggregated)."
        >
          <div className="relative mt-4 h-[280px] w-full min-w-0">
            {invoiceStatusPieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={invoiceStatusPieData}
                      dataKey="amountMinor"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={96}
                      paddingAngle={2}
                      label={(props) => {
                        const pct = Number(props.percent ?? 0);
                        const sliceName =
                          props.name ?? String(props.payload?.label ?? "");
                        return pct >= 0.06
                          ? `${sliceName} ${(pct * 100).toFixed(0)}%`
                          : "";
                      }}
                      labelLine={{
                        stroke: "color-mix(in srgb, var(--line-strong) 45%, transparent)",
                      }}
                    >
                      {invoiceStatusPieData.map((row, i) => (
                        <Cell key={`inv-status-${i}`} fill={row.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) {
                          return null;
                        }
                        const p = payload[0]?.payload as {
                          label: string;
                          amountMinor: number;
                        };
                        const pct =
                          invoiceIssuedTotalMinor > 0
                            ? Math.round(
                                (p.amountMinor / invoiceIssuedTotalMinor) *
                                  1000,
                              ) / 10
                            : 0;
                        return (
                          <div className="max-w-xs rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_64%,transparent)] bg-[var(--bg-elevated)] px-3 py-2 text-xs shadow-lg">
                            <p className="font-semibold">{p.label}</p>
                            <p className="tabular-nums">{fmt(p.amountMinor)}</p>
                            <p className="mt-0.5 text-[var(--text-muted)]">
                              {pct}% of issued invoice totals
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: "12px" }}
                      formatter={(value) => (
                        <span className="text-[var(--text-secondary)]">
                          {value}
                        </span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                  style={{ paddingBottom: "2.25rem" }}
                >
                  <div className="text-center">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      Issued total
                    </p>
                    <p className="text-base font-semibold tabular-nums text-[var(--text-primary)]">
                      {fmt(invoiceIssuedTotalMinor)}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <EmptyChart />
            )}
          </div>
        </ChartCard>

        <ChartCard
          title="Monthly fee yield vs capacity"
          subtitle="Billed monthly_fee lines (finalized) vs configured ward capacity × months in range"
        >
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_60%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_88%,transparent)] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Capacity / month
              </p>
              <p className="mt-2 text-xl font-semibold tabular-nums">
                {fmt(financial.projectedMonthlyCapacityMinor)}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Σ beds × ward rate (configured wards)
              </p>
            </div>
            <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_60%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_88%,transparent)] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Monthly fees (range)
              </p>
              <p className="mt-2 text-xl font-semibold tabular-nums">
                {fmt(financial.monthlyFeesBilledInRangeMinor)}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Sum of monthly_fee lines by service month
              </p>
            </div>
            <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_60%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_88%,transparent)] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Yield
              </p>
              <p className="mt-2 text-xl font-semibold tabular-nums">
                {financial.yieldPercent != null
                  ? `${financial.yieldPercent}%`
                  : "—"}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Fees ÷ (capacity × months)
              </p>
            </div>
          </div>
        </ChartCard>
      </div>
    </>
  );
}

function RevenueTab({
  financial,
  fmt,
}: {
  financial: FinancialAnalyticsSnapshot;
  fmt: (n: number) => string;
}) {
  const categoryData = financial.revenueByCategory.filter(
    (r) => r.amountMinor > 0,
  );
  const residentOwedVsPaidData = [
    {
      label: "Total paid",
      amountMinor: financial.kpis.totalCollectedMinor,
      fill: RESIDENT_PAID_FILL,
    },
    {
      label: "Total owed",
      amountMinor: financial.kpis.outstandingReceivablesMinor,
      fill: RESIDENT_OWED_FILL,
    },
  ].filter((r) => r.amountMinor > 0);
  const segmentData = financial.revenueBySegment
    .map((r) => ({
      ...r,
      amountMinor: Number(r.amountMinor),
    }))
    .filter((r) => Number.isFinite(r.amountMinor) && r.amountMinor > 0);
  const segmentTitle =
    financial.revenueSegmentKind === "ward"
      ? "Collections by ward (resident payments)"
      : "Collections by home";

  const barHeight = Math.max(200, segmentData.length * 36);

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Finalized invoice revenue by category"
          subtitle="Grouped by line item category"
        >
          <div className="mt-4 h-[280px] w-full min-w-0">
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    dataKey="amountMinor"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={96}
                    paddingAngle={2}
                  >
                    {categoryData.map((_, i) => (
                      <Cell
                        key={`c-${i}`}
                        fill={
                          FIN_CHART.categoryCycle[
                            i % FIN_CHART.categoryCycle.length
                          ]!
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) {
                        return null;
                      }
                      const p = payload[0]?.payload as {
                        label: string;
                        amountMinor: number;
                      };
                      return (
                        <div className="rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_64%,transparent)] bg-[var(--bg-elevated)] px-3 py-2 text-xs shadow-lg">
                          <p className="font-semibold">{p.label}</p>
                          <p className="tabular-nums">{fmt(p.amountMinor)}</p>
                        </div>
                      );
                    }}
                  />
                  <Legend
                    layout="horizontal"
                    verticalAlign="bottom"
                    formatter={(value) => (
                      <span className="text-[var(--text-secondary)]">
                        {value}
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </ChartCard>

        <ChartCard
          title="Residents: total owed vs paid"
          subtitle="Paid = resident collections in selected period; owed = current outstanding resident receivables"
        >
          <div className="mt-4 h-[280px] w-full min-w-0">
            {residentOwedVsPaidData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={residentOwedVsPaidData}
                    dataKey="amountMinor"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={96}
                    paddingAngle={2}
                  >
                    {residentOwedVsPaidData.map((row, i) => (
                      <Cell
                        key={`resident-revenue-balance-${i}`}
                        fill={row.fill}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) {
                        return null;
                      }
                      const p = payload[0]?.payload as {
                        label: string;
                        amountMinor: number;
                      };
                      return (
                        <div className="rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_64%,transparent)] bg-[var(--bg-elevated)] px-3 py-2 text-xs shadow-lg">
                          <p className="font-semibold">{p.label}</p>
                          <p className="tabular-nums">{fmt(p.amountMinor)}</p>
                        </div>
                      );
                    }}
                  />
                  <Legend verticalAlign="bottom" layout="horizontal" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </ChartCard>
      </div>

      <ChartCard
        title={segmentTitle}
        subtitle={
          financial.revenueSegmentKind === "home"
            ? "Resident billing payments only"
            : undefined
        }
      >
        <div
          className="mt-4 w-full min-w-0"
          style={{ height: Math.min(520, barHeight) }}
        >
          {segmentData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={segmentData}
                margin={{ top: 4, right: 12, left: 8, bottom: 4 }}
              >
                <CartesianGrid
                  stroke="color-mix(in srgb, var(--line-strong) 50%, transparent)"
                  strokeDasharray="4 6"
                  horizontal
                />
                <XAxis
                  type="number"
                  tickFormatter={(v) => fmt(v)}
                  tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={148}
                  tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) {
                      return null;
                    }
                    const row = payload[0]?.payload as {
                      label: string;
                      amountMinor: number;
                    };
                    return (
                      <div className="rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_64%,transparent)] bg-[var(--bg-elevated)] px-3 py-2 text-xs shadow-lg">
                        <p className="font-semibold">{row.label}</p>
                        <p className="tabular-nums">{fmt(row.amountMinor)}</p>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="amountMinor"
                  fill={FIN_CHART.collected}
                  radius={[0, 6, 6, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </div>
      </ChartCard>

      <ChartCard
        title="Largest outstanding resident balances"
        subtitle="Positive ledger balances only"
      >
        {financial.topOutstanding.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="py-2 pr-3 font-semibold">Resident</th>
                  <th className="py-2 pr-3 font-semibold tabular-nums">
                    Balance
                  </th>
                  <th className="py-2 font-semibold"> </th>
                </tr>
              </thead>
              <tbody>
                {financial.topOutstanding.map((row) => (
                  <tr
                    key={`${row.homeId}-${row.residentId}`}
                    className="border-b border-[color:color-mix(in_srgb,var(--line-subtle)_55%,transparent)]"
                  >
                    <td className="py-2.5 pr-3 font-medium">{row.fullName}</td>
                    <td className="py-2.5 pr-3 tabular-nums font-semibold">
                      {fmt(row.balanceMinor)}
                    </td>
                    <td className="py-2.5 text-right">
                      <Link
                        href={`/dashboard/homes/${row.homeId}/residents/${row.residentId}`}
                        className="text-[var(--highlight)] underline decoration-[color:color-mix(in_srgb,var(--highlight)_35%,transparent)] underline-offset-2 hover:decoration-[color:color-mix(in_srgb,var(--highlight)_62%,transparent)]"
                      >
                        Open resident
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-[var(--text-muted)]">
            No outstanding resident balances in this scope.
          </p>
        )}
      </ChartCard>
    </>
  );
}

function ExpensesTab({
  expenses,
  fmt,
}: {
  expenses: ExpenseAnalyticsSnapshot;
  fmt: (n: number) => string;
}) {
  const byCategory = expenses.expensesByCategory.filter(
    (r) => r.amountMinor > 0,
  );
  const expenseCategoryTotalMinor = byCategory.reduce(
    (s, r) => s + r.amountMinor,
    0,
  );
  const homeOwedVsPaidData = [
    {
      label: "Total paid",
      amountMinor: expenses.homeInvoicePaymentsMinor,
      fill: FIN_CHART.expenses,
    },
    {
      label: "Total owed",
      amountMinor: expenses.homeOutstandingReceivablesMinor,
      fill: FIN_CHART.owed,
    },
  ].filter((r) => r.amountMinor > 0);

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Home Expenses (period)"
          value={fmt(expenses.totalExpensesMinor)}
          hint="Payments on home billing accounts by received date"
        />
        <KpiCard
          label="Expense categories"
          value={String(byCategory.length)}
          hint="Distinct line item categories on finalized home invoices"
        />
        <KpiCard
          label="Home receivables now"
          value={fmt(expenses.homeOutstandingReceivablesMinor)}
          hint="Current outstanding on home accounts"
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Home expense by category"
          subtitle="Finalized home-account invoice line items (issued in this period)"
        >
          <div className="relative mt-4 h-[280px] w-full min-w-0">
            {byCategory.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byCategory}
                      dataKey="amountMinor"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={96}
                      paddingAngle={2}
                    >
                      {byCategory.map((_, i) => (
                        <Cell
                          key={`exp-cat-${i}`}
                          fill={
                            FIN_CHART.categoryCycle[
                              i % FIN_CHART.categoryCycle.length
                            ]!
                          }
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) {
                          return null;
                        }
                        const p = payload[0]?.payload as {
                          label: string;
                          amountMinor: number;
                        };
                        const pct =
                          expenseCategoryTotalMinor > 0
                            ? Math.round(
                                (p.amountMinor / expenseCategoryTotalMinor) *
                                  1000,
                              ) / 10
                            : 0;
                        return (
                          <div className="max-w-xs rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_64%,transparent)] bg-[var(--bg-elevated)] px-3 py-2 text-xs shadow-lg">
                            <p className="font-semibold">{p.label}</p>
                            <p className="tabular-nums">{fmt(p.amountMinor)}</p>
                            <p className="mt-0.5 text-[var(--text-muted)]">
                              {pct}% of categorized expenses
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Legend
                      layout="horizontal"
                      verticalAlign="bottom"
                      wrapperStyle={{ fontSize: "12px" }}
                      formatter={(value) => (
                        <span className="text-[var(--text-secondary)]">
                          {value}
                        </span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                  style={{ paddingBottom: "2.25rem" }}
                >
                  <div className="text-center">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      Total
                    </p>
                    <p className="text-base font-semibold tabular-nums text-[var(--text-primary)]">
                      {fmt(expenseCategoryTotalMinor)}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <EmptyChart />
            )}
          </div>
        </ChartCard>

        <ChartCard
          title="Homes: total owed vs paid"
          subtitle="Paid = home expenses in selected period; owed = current outstanding home receivables"
        >
          <div className="mt-4 h-[280px] w-full min-w-0">
            {homeOwedVsPaidData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={homeOwedVsPaidData}
                    dataKey="amountMinor"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={96}
                    paddingAngle={2}
                  >
                    {homeOwedVsPaidData.map((row, i) => (
                      <Cell key={`home-balance-${i}`} fill={row.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) {
                        return null;
                      }
                      const p = payload[0]?.payload as {
                        label: string;
                        amountMinor: number;
                      };
                      return (
                        <div className="rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_64%,transparent)] bg-[var(--bg-elevated)] px-3 py-2 text-xs shadow-lg">
                          <p className="font-semibold">{p.label}</p>
                          <p className="tabular-nums">{fmt(p.amountMinor)}</p>
                        </div>
                      );
                    }}
                  />
                  <Legend verticalAlign="bottom" layout="horizontal" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart />
            )}
          </div>
        </ChartCard>

      </div>
    </>
  );
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_64%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-elevated)_97%,transparent),color-mix(in_srgb,var(--bg-muted)_86%,transparent))] p-4 shadow-[0_12px_24px_-22px_color-mix(in_srgb,var(--accent)_55%,transparent)]">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--text-primary)] sm:text-3xl">
        {value}
      </p>
      {hint ? (
        <p className="mt-2 text-xs text-[var(--text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_60%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_96%,transparent)] p-4 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--bg-canvas)_70%,transparent)] sm:p-5">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">
        {title}
      </h3>
      {subtitle ? (
        <p className="mt-1 text-xs text-[var(--text-muted)]">{subtitle}</p>
      ) : null}
      {children}
    </section>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full min-h-[12rem] items-center justify-center rounded-xl border border-dashed border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_70%,transparent)] px-4 text-center text-sm text-[var(--text-muted)]">
      No data in this period for the selected filters.
    </div>
  );
}

import type { ReactNode } from "react";
import type { SessionUserRole } from "@/lib/session";
import type {
  MonthEndCensusChartDatum,
  ResidentsPerHomeChartDatum,
} from "@/lib/dashboard/charts";
import { MonthEndCensusChart } from "./MonthEndCensusChart";
import { ResidentsPerHomeChart } from "./ResidentsPerHomeChart";

type DashboardAnalyticsSectionProps = {
  role: SessionUserRole;
  residentsPerHome: ResidentsPerHomeChartDatum[];
  /** Sum of active residents across all non-archived homes (admin chart scope). */
  totalActiveResidentsAllHomes: number;
  /** Sum of ward bed counts (non-null only) for non-archived wards in non-archived homes. */
  configuredBedsAllSites: number;
  /** Whole percent active ÷ configured beds, or null if no beds configured. */
  occupancyPercentAllSites: number | null;
  monthEndCensus: MonthEndCensusChartDatum[];
};

function StatCardIconWrap({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[color:color-mix(in_srgb,var(--line-subtle)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_84%,transparent)] text-[var(--accent-strong)] shadow-inner"
      aria-hidden
    >
      {children}
    </div>
  );
}

function IconResidents() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
      />
    </svg>
  );
}

function IconBeds() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 18v-4.5A2.25 2.25 0 014.5 11.25h2.25M2.25 18v3m0-3h20m0 0v-4.5A2.25 2.25 0 0019.5 11.25h-2.25m-15 6.75h20m-9-6.75V9a2.25 2.25 0 114.5 0v2.25m-9 0H9m3 0h3"
      />
    </svg>
  );
}

function IconOccupancy() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path strokeLinecap="round" d="M6 20V10M12 20V4M18 20v-8" />
    </svg>
  );
}

export function DashboardAnalyticsSection({
  role,
  residentsPerHome,
  totalActiveResidentsAllHomes,
  configuredBedsAllSites,
  occupancyPercentAllSites,
  monthEndCensus,
}: DashboardAnalyticsSectionProps) {
  if (role !== "admin") {
    return null;
  }

  const homeCount = residentsPerHome.length;

  return (
    <div className="village-reveal space-y-7 rounded-3xl border border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_86%,transparent)] p-5 shadow-[var(--shadow-md)] sm:p-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] px-5 py-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Active residents (all sites)
              </p>
              <p className="mt-2 font-display text-4xl font-normal leading-none tracking-tight text-[var(--text-primary)] tabular-nums">
                {totalActiveResidentsAllHomes}
              </p>
            </div>
            <StatCardIconWrap>
              <IconResidents />
            </StatCardIconWrap>
          </div>
          <p className="mt-3 text-sm leading-5 text-[var(--text-secondary)]">
            {homeCount === 0
              ? "No non-archived homes in the directory yet."
              : `Across ${homeCount} non-archived ${homeCount === 1 ? "home" : "homes"}.`}
          </p>
        </div>

        <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] px-5 py-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Configured beds (all sites)
              </p>
              <p className="mt-2 font-display text-4xl font-normal leading-none tracking-tight text-[var(--text-primary)] tabular-nums">
                {configuredBedsAllSites}
              </p>
            </div>
            <StatCardIconWrap>
              <IconBeds />
            </StatCardIconWrap>
          </div>
          <p className="mt-3 text-sm leading-5 text-[var(--text-secondary)]">
            Sum of bed counts on non-archived wards; wards with no bed count add
            nothing.
          </p>
        </div>

        <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_92%,transparent)] px-5 py-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                Overall occupancy
              </p>
              <p className="mt-2 font-display text-4xl font-normal leading-none tracking-tight text-[var(--text-primary)] tabular-nums">
                {occupancyPercentAllSites != null
                  ? `${occupancyPercentAllSites}%`
                  : "—"}
              </p>
            </div>
            <StatCardIconWrap>
              <IconOccupancy />
            </StatCardIconWrap>
          </div>
          <p className="mt-3 text-sm leading-5 text-[var(--text-secondary)]">
            {occupancyPercentAllSites != null
              ? "Active residents divided by configured beds, all non-archived sites."
              : "Configure at least one ward bed count to compute occupancy."}
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <section className="village-card min-w-0">
          <h2 className="village-section-title">Residents per home</h2>
          <p className="village-muted mt-2">
            Active residents across non-archived retirement homes.
          </p>
          <ResidentsPerHomeChart data={residentsPerHome} />
        </section>

        <section className="village-card min-w-0">
          <h2 className="village-section-title">Month-end census by home</h2>
          <p className="village-muted mt-2">
            Census at each month-end this year, stacked by non-archived home.
          </p>
          <MonthEndCensusChart data={monthEndCensus} />
        </section>

      </div>
    </div>
  );
}

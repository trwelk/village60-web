import {
  getDemographicsAnalytics,
  listResidentsPerCareNurse,
} from "@/lib/analytics/demographicsWorkload";
import { getDb } from "@/db/client";
import { listDashboardHomeOptions } from "@/lib/dashboard/charts";
import { DemographicsSection } from "../DemographicsSection";
import { StaffWorkloadSection } from "../StaffWorkloadSection";

export default async function AnalyticsDemographicsStaffPage() {
  const db = getDb();
  // eslint-disable-next-line react-hooks/purity -- dashboard analytics use live clock; page is dynamically rendered
  const atMs = Date.now();
  const homeOptions = listDashboardHomeOptions(db);
  const demographicsKpis = getDemographicsAnalytics(db, atMs);
  const residentsPerNurse = listResidentsPerCareNurse(db);

  return (
    <main className="flex flex-col gap-8 text-[var(--text-primary)]">
      <div className="village-hero-card village-reveal px-5 py-6 sm:px-7 sm:py-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex max-w-3xl flex-col gap-3.5">
            <p className="village-kicker">Admin · Analytics</p>
            <h1 className="village-page-title text-4xl tracking-tight sm:text-[2.7rem]">
              Demographics
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-[var(--text-secondary)] sm:text-[0.95rem]">
              Resident age distribution and care ratios: active residents per
              assigned care nurse across homes.
            </p>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-3 lg:w-[31rem]">
            <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-subtle)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_62%,transparent)] px-3 py-2.5">
              <span className="village-field-label block">Active residents</span>
              <span className="mt-1 block font-display text-2xl text-[var(--text-primary)] tabular-nums">
                {demographicsKpis.totalActiveResidents}
              </span>
            </div>
            <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-subtle)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_62%,transparent)] px-3 py-2.5">
              <span className="village-field-label block">Care nurses</span>
              <span className="mt-1 block font-display text-2xl text-[var(--text-primary)] tabular-nums">
                {residentsPerNurse.length}
              </span>
            </div>
            <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-subtle)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_62%,transparent)] px-3 py-2.5">
              <span className="village-field-label block">Homes</span>
              <span className="mt-1 block font-display text-2xl text-[var(--text-primary)] tabular-nums">
                {homeOptions.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      <DemographicsSection kpis={demographicsKpis} />

      <StaffWorkloadSection perNurse={residentsPerNurse} />
    </main>
  );
}

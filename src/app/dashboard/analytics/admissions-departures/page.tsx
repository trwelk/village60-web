import {
  getAdmissionsDeparturesKpis,
  listTwelveMonthAdmissionsDepartures,
} from "@/lib/analytics/admissionsDepartures";
import { getDb } from "@/db/client";
import { listDashboardHomeOptions } from "@/lib/dashboard/charts";
import { AdmissionsDeparturesSection } from "../AdmissionsDeparturesSection";

export default async function AnalyticsAdmissionsDeparturesPage() {
  const db = getDb();
  // eslint-disable-next-line react-hooks/purity -- dashboard analytics use live clock; page is dynamically rendered
  const at = Date.now();
  const homeOptions = listDashboardHomeOptions(db);
  const admissionsKpis = getAdmissionsDeparturesKpis(db, at);
  const admissionsDeparturesSeries = listTwelveMonthAdmissionsDepartures(db, at);

  return (
    <main className="flex flex-col gap-8 text-[var(--text-primary)]">
      <div className="village-card village-reveal p-5 sm:p-6">
        <div className="grid max-w-xl gap-2 text-sm sm:grid-cols-3 lg:max-w-[31rem]">
          <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-subtle)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_62%,transparent)] px-3 py-2.5">
            <span className="village-field-label block">Admissions (month)</span>
            <span className="mt-1 block font-display text-2xl text-[var(--text-primary)] tabular-nums">
              {admissionsKpis.admissionsThisMonth}
            </span>
          </div>
          <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-subtle)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_62%,transparent)] px-3 py-2.5">
            <span className="village-field-label block">Departures (month)</span>
            <span className="mt-1 block font-display text-2xl text-[var(--text-primary)] tabular-nums">
              {admissionsKpis.departuresThisMonth}
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

      <AdmissionsDeparturesSection
        kpis={admissionsKpis}
        twelveMonth={admissionsDeparturesSeries}
      />
    </main>
  );
}

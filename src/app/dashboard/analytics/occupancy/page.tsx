import { getDb } from "@/db/client";
import {
  listMonthEndCensusChart,
  listResidentsPerHomeChart,
  overallOccupancyPercent,
  sumConfiguredBedsAllActiveSites,
} from "@/lib/dashboard/charts";
import { DashboardAnalyticsSection } from "./DashboardAnalyticsSection";

export const metadata = {
  title: "Occupancy Analytics | Village60",
};

export default async function OccupancyAnalyticsPage() {
  const db = getDb();

  const residentsPerHome = listResidentsPerHomeChart(db);
  const totalActiveResidentsAllHomes = residentsPerHome.reduce(
    (sum, row) => sum + row.residentCount,
    0,
  );
  const configuredBedsAllSites = sumConfiguredBedsAllActiveSites(db);
  const occupancyPercentAllSites = overallOccupancyPercent(
    totalActiveResidentsAllHomes,
    configuredBedsAllSites,
  );
  const monthEndCensus = listMonthEndCensusChart(db);

  return (
    <main className="flex flex-col gap-8 text-[var(--text-primary)]">
      <DashboardAnalyticsSection
        role="admin"
        residentsPerHome={residentsPerHome}
        totalActiveResidentsAllHomes={totalActiveResidentsAllHomes}
        configuredBedsAllSites={configuredBedsAllSites}
        occupancyPercentAllSites={occupancyPercentAllSites}
        monthEndCensus={monthEndCensus}
      />
    </main>
  );
}

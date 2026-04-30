import {
  getAdmissionsDeparturesKpis,
  getDepartureReasonBreakdownLastTwelveMonths,
  listTwelveMonthAdmissionsDepartures,
} from "@/lib/analytics/admissionsDepartures";
import {
  getDemographicsAnalytics,
  listResidentsPerCareNurse,
} from "@/lib/analytics/demographicsWorkload";
import {
  getRevenueKpis,
  listPaymentLagByHome,
  listTwelveMonthBilledVsCollected,
} from "@/lib/analytics/revenueCollections";
import { getDb } from "@/db/client";
import { homes } from "@/db/schema";
import { listDashboardHomeOptions } from "@/lib/dashboard/charts";
import { DEFAULT_CURRENCY_CODE } from "@/lib/homes/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { eq } from "drizzle-orm";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdmissionsDeparturesSection } from "./AdmissionsDeparturesSection";
import { DemographicsSection } from "./DemographicsSection";
import { RevenueCollectionsSection } from "./RevenueCollectionsSection";
import { StaffWorkloadSection } from "./StaffWorkloadSection";

export default async function AnalyticsPage() {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  if (!session.userId) {
    redirect("/login");
  }
  if (session.role !== "admin") {
    redirect("/dashboard");
  }

  const db = getDb();
  /* Current instant for UTC billing-month windows (see `utcBillingMonthFromMs`). */
  // eslint-disable-next-line react-hooks/purity -- dashboard analytics use live clock; page is dynamically rendered
  const atMs = Date.now();
  const homeOptions = listDashboardHomeOptions(db);
  const firstHomeId = homeOptions[0]?.homeId;
  const firstHomeRow = firstHomeId
    ? db.select().from(homes).where(eq(homes.id, firstHomeId)).get()
    : undefined;
  const displayCurrency =
    firstHomeRow?.defaultCurrencyCode ?? DEFAULT_CURRENCY_CODE;
  const revenueKpis = getRevenueKpis(db, atMs);
  const billedVsCollected = listTwelveMonthBilledVsCollected(db, atMs);
  const paymentLag = listPaymentLagByHome(db);
  const admissionsKpis = getAdmissionsDeparturesKpis(db, atMs);
  const admissionsDeparturesSeries = listTwelveMonthAdmissionsDepartures(
    db,
    atMs,
  );
  const departureReasons = getDepartureReasonBreakdownLastTwelveMonths(
    db,
    atMs,
  );
  const demographicsKpis = getDemographicsAnalytics(db, atMs);
  const residentsPerNurse = listResidentsPerCareNurse(db);

  return (
    <main className="flex flex-col gap-10 text-ink">
      <div className="village-card village-reveal relative isolate overflow-hidden px-5 py-6 sm:px-7">
        <div className="absolute inset-y-0 right-0 -z-10 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(25,114,75,0.2),transparent_46%),radial-gradient(circle_at_bottom_right,rgba(15,141,87,0.14),transparent_42%)]" />
        <div className="flex max-w-3xl flex-col gap-3">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-pine/75">
            Admin
          </p>
          <h1 className="village-page-title text-4xl sm:text-[2.5rem]">
            Analytics
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-ink/70">
            Revenue & collections, resident movement, demographics, and staff
            workload across all homes.
          </p>
        </div>
      </div>

      <RevenueCollectionsSection
        currencyCode={displayCurrency}
        kpis={revenueKpis}
        billedVsCollected={billedVsCollected}
        paymentLag={paymentLag}
      />

      <AdmissionsDeparturesSection
        kpis={admissionsKpis}
        twelveMonth={admissionsDeparturesSeries}
        reasonBreakdown={departureReasons}
      />

      <DemographicsSection kpis={demographicsKpis} />

      <StaffWorkloadSection perNurse={residentsPerNurse} />
    </main>
  );
}

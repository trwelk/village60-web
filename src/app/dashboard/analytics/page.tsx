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
    <main className="flex flex-col gap-8 text-[var(--text-primary)]">
      <div className="village-card village-reveal relative isolate overflow-hidden border border-[color:color-mix(in_srgb,var(--line-strong)_58%,transparent)] bg-[linear-gradient(130deg,color-mix(in_srgb,var(--bg-elevated)_95%,transparent),color-mix(in_srgb,var(--bg-muted)_90%,transparent))] px-5 py-6 shadow-[0_18px_46px_-30px_color-mix(in_srgb,var(--accent)_52%,transparent)] sm:px-7 sm:py-7">
        <div className="absolute inset-y-0 right-0 -z-10 w-2/3 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_22%,transparent),transparent_44%),radial-gradient(circle_at_bottom_right,color-mix(in_srgb,var(--highlight)_18%,transparent),transparent_40%)]" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-px bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--line-strong)_55%,transparent),transparent)]" />
        <div className="flex max-w-3xl flex-col gap-3.5">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-[var(--accent-strong)]">
            Admin
          </p>
          <h1 className="village-page-title text-4xl tracking-tight sm:text-[2.7rem]">
            Analytics
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-[var(--text-secondary)] sm:text-[0.95rem]">
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

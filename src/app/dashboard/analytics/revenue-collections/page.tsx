import {
  getRevenueKpis,
  listPaymentLagByHome,
  listTwelveMonthBilledVsCollected,
} from "@/lib/analytics/revenueCollections";
import { getDb } from "@/db/client";
import { homes } from "@/db/schema";
import { listDashboardHomeOptions } from "@/lib/dashboard/charts";
import { DEFAULT_CURRENCY_CODE } from "@/lib/homes/service";
import { eq } from "drizzle-orm";
import { RevenueCollectionsSection } from "../RevenueCollectionsSection";

export default async function AnalyticsRevenueCollectionsPage() {
  const db = getDb();
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

  return (
    <main className="flex flex-col gap-8 text-[var(--text-primary)]">
      <div className="village-hero-card village-reveal px-5 py-6 sm:px-7 sm:py-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex max-w-3xl flex-col gap-3.5">
            <p className="village-kicker">Admin · Analytics</p>
            <h1 className="village-page-title text-4xl tracking-tight sm:text-[2.7rem]">
              Revenue
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-[var(--text-secondary)] sm:text-[0.95rem]">
              Billed vs collected trends, collection KPIs, and payment lag by
              home across the portfolio.
            </p>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-3 lg:w-[31rem]">
            <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-subtle)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_62%,transparent)] px-3 py-2.5">
              <span className="village-field-label block">This month billed</span>
              <span className="mt-1 block font-display text-2xl text-[var(--text-primary)] tabular-nums">
                {revenueKpis.monthlyBilledMinor > 0 ? "Tracked" : "Open"}
              </span>
            </div>
            <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-subtle)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_62%,transparent)] px-3 py-2.5">
              <span className="village-field-label block">Collection rate</span>
              <span className="mt-1 block font-display text-2xl text-[var(--text-primary)] tabular-nums">
                {revenueKpis.collectionRatePercent != null
                  ? `${revenueKpis.collectionRatePercent}%`
                  : "—"}
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

      <RevenueCollectionsSection
        currencyCode={displayCurrency}
        kpis={revenueKpis}
        billedVsCollected={billedVsCollected}
        paymentLag={paymentLag}
      />
    </main>
  );
}

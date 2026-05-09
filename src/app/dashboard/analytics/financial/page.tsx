import {
  getExpenseAnalyticsSnapshot,
  getFinancialAnalyticsSnapshot,
  type FinancialPreset,
} from "@/lib/analytics/financialOverview";
import { getDb } from "@/db/client";
import { homes } from "@/db/schema";
import { listDashboardHomeOptions } from "@/lib/dashboard/charts";
import { DEFAULT_CURRENCY_CODE } from "@/lib/homes/defaultCurrencyCode";
import { eq } from "drizzle-orm";
import { FinancialAnalyticsClient } from "./FinancialAnalyticsClient";

type PageProps = {
  searchParams?: Promise<{ home?: string; preset?: string }>;
};

function parseFinancialPreset(raw: string | undefined): FinancialPreset {
  if (raw === "6") {
    return "6";
  }
  if (raw === "ytd") {
    return "ytd";
  }
  return "12";
}

export default async function FinancialAnalyticsPage({
  searchParams,
}: PageProps) {
  const db = getDb();
  const q = searchParams ? await searchParams : {};
  const preset = parseFinancialPreset(
    typeof q.preset === "string" ? q.preset : undefined,
  );

  const homeOptions = listDashboardHomeOptions(db);

  const rawHome =
    typeof q.home === "string" && q.home.trim() !== "" ? q.home.trim() : "all";

  let selectedHomeId: string | null = null;
  let selectedHomeKey = "all";

  if (rawHome !== "all") {
    const exists = homeOptions.some((h) => h.homeId === rawHome);
    if (exists) {
      selectedHomeId = rawHome;
      selectedHomeKey = rawHome;
    }
  }

  const displayCurrency =
    selectedHomeId != null
      ? (db.select().from(homes).where(eq(homes.id, selectedHomeId)).get()
          ?.defaultCurrencyCode ?? DEFAULT_CURRENCY_CODE)
      : (homeOptions[0]
          ? (db.select().from(homes).where(eq(homes.id, homeOptions[0]!.homeId)).get()
              ?.defaultCurrencyCode ?? DEFAULT_CURRENCY_CODE)
          : DEFAULT_CURRENCY_CODE);

  // eslint-disable-next-line react-hooks/purity -- dashboard analytics use live clock; page is dynamically rendered
  const atUtcMs = Date.now();

  const financial = getFinancialAnalyticsSnapshot(db, {
    atUtcMs,
    preset,
    homeId: selectedHomeId,
    displayCurrencyCode: displayCurrency,
  });

  const expenses = getExpenseAnalyticsSnapshot(db, {
    atUtcMs,
    preset,
    homeId: selectedHomeId,
    displayCurrencyCode: displayCurrency,
  });

  return (
    <main className="flex flex-col gap-8 text-[var(--text-primary)]">
      <FinancialAnalyticsClient
        financial={financial}
        expenses={expenses}
        homeOptions={homeOptions}
        selectedHomeKey={selectedHomeKey}
        preset={preset}
      />
    </main>
  );
}

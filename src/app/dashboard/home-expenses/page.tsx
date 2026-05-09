import { getDb } from "@/db/client";
import { homes } from "@/db/schema";
import {
  resolveLedgerBillingMonthRange,
  utcYearToDateBillingMonthRange,
} from "@/lib/billing/billingMonth";
import {
  DEFAULT_HOME_OPERATING_INVOICES_PAGE_SIZE,
  listHomeOperatingInvoiceLedger,
  MAX_HOME_OPERATING_INVOICES_PAGE_SIZE,
} from "@/lib/billing/homeOperatingInvoiceLedger";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { listDashboardHomeOptions } from "@/lib/dashboard/charts";
import { DEFAULT_CURRENCY_CODE } from "@/lib/homes/defaultCurrencyCode";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { eq } from "drizzle-orm";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HomeExpensesSection } from "./HomeExpensesSection";

type HomeExpensesPageProps = {
  searchParams?: Promise<{
    homeId?: string;
    billingMonthFrom?: string;
    billingMonthTo?: string;
    page?: string;
    pageSize?: string;
  }>;
};

function parsePageParam(raw: string | undefined): number {
  if (raw === undefined || raw === "") {
    return 1;
  }
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) {
    return 1;
  }
  return n;
}

function parsePageSizeParam(raw: string | undefined): number {
  if (raw === undefined || raw === "") {
    return DEFAULT_HOME_OPERATING_INVOICES_PAGE_SIZE;
  }
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) {
    return DEFAULT_HOME_OPERATING_INVOICES_PAGE_SIZE;
  }
  return Math.min(MAX_HOME_OPERATING_INVOICES_PAGE_SIZE, n);
}

const emptyLedger: {
  rows: never[];
  totalCount: number;
  page: number;
  pageSize: number;
  summary: {
    totalBilledMinor: number;
    chargeCount: number;
    paidCount: number;
    unpaidCount: number;
    unpaidBalanceMinor: number;
  };
} = {
  rows: [],
  totalCount: 0,
  page: 1,
  pageSize: DEFAULT_HOME_OPERATING_INVOICES_PAGE_SIZE,
  summary: {
    totalBilledMinor: 0,
    chargeCount: 0,
    paidCount: 0,
    unpaidCount: 0,
    unpaidBalanceMinor: 0,
  },
};

export default async function HomeExpensesPage({ searchParams }: HomeExpensesPageProps) {
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
  const actor = requireSessionActor(session);
  const db = getDb();
  const homeOptions = listDashboardHomeOptions(db);
  const q = searchParams ? await searchParams : {};
  let selectedHomeId = typeof q.homeId === "string" ? q.homeId : "";
  if (
    selectedHomeId &&
    !homeOptions.some((h) => h.homeId === selectedHomeId)
  ) {
    selectedHomeId = "";
  }
  if (!selectedHomeId) {
    selectedHomeId = homeOptions[0]?.homeId ?? "";
  }
  const homeRow = selectedHomeId
    ? db.select().from(homes).where(eq(homes.id, selectedHomeId)).get()
    : undefined;
  // Anchor YTD/month defaults to wall clock at render (matches `charges/page.tsx`).
  // eslint-disable-next-line react-hooks/purity -- Server page time basis for UTC month range only
  const atMs = Date.now();
  const ytd = utcYearToDateBillingMonthRange(atMs);
  const monthRange = resolveLedgerBillingMonthRange(
    q.billingMonthFrom,
    q.billingMonthTo,
    atMs,
  );
  const rangeIsDefaultYtd =
    monthRange.billingMonthFrom === ytd.billingMonthFrom &&
    monthRange.billingMonthTo === ytd.billingMonthTo;
  const page = parsePageParam(typeof q.page === "string" ? q.page : undefined);
  const pageSize = parsePageSizeParam(
    typeof q.pageSize === "string" ? q.pageSize : undefined,
  );
  const ledger =
    selectedHomeId && homeRow
      ? listHomeOperatingInvoiceLedger(db, actor, selectedHomeId, {
          paymentStatus: "all",
          ...monthRange,
          page,
          pageSize,
        })
      : emptyLedger;

  return (
    <main className="flex flex-col gap-7 text-[var(--text-primary)]">
      <HomeExpensesSection
        homes={homeOptions}
        selectedHomeId={selectedHomeId}
        defaultCurrencyCode={homeRow?.defaultCurrencyCode ?? DEFAULT_CURRENCY_CODE}
        billingMonthFrom={monthRange.billingMonthFrom}
        billingMonthTo={monthRange.billingMonthTo}
        ytdBillingMonthFrom={ytd.billingMonthFrom}
        ytdBillingMonthTo={ytd.billingMonthTo}
        rangeIsDefaultYtd={rangeIsDefaultYtd}
        ledger={ledger}
      />
    </main>
  );
}

import { getDb } from "@/db/client";
import { homes } from "@/db/schema";
import {
  resolveLedgerBillingMonthRange,
  utcYearToDateBillingMonthRange,
} from "@/lib/billing/billingMonth";
import {
  DEFAULT_CHARGES_LEDGER_PAGE_SIZE,
  listHomeMonthlyChargesLedger,
  MAX_CHARGES_LEDGER_PAGE_SIZE,
  type HomeMonthlyChargeLedgerRow,
  type HomeMonthlyChargesLedgerPaymentStatusFilter,
  type HomeMonthlyChargesLedgerSummary,
} from "@/lib/billing/residentCharges";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { listDashboardHomeOptions } from "@/lib/dashboard/charts";
import { DEFAULT_CURRENCY_CODE } from "@/lib/homes/defaultCurrencyCode";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { eq } from "drizzle-orm";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HomeChargesSection } from "./HomeChargesSection";

type ChargesPageProps = {
  searchParams?: Promise<{
    homeId?: string;
    billingMonthFrom?: string;
    billingMonthTo?: string;
    page?: string;
    pageSize?: string;
    paymentStatus?: string;
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
    return DEFAULT_CHARGES_LEDGER_PAGE_SIZE;
  }
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) {
    return DEFAULT_CHARGES_LEDGER_PAGE_SIZE;
  }
  return Math.min(MAX_CHARGES_LEDGER_PAGE_SIZE, n);
}

function parsePaymentStatusParam(
  raw: string | undefined,
): HomeMonthlyChargesLedgerPaymentStatusFilter {
  if (raw === "paid" || raw === "unpaid") {
    return raw;
  }
  return "all";
}

const emptyChargesLedger: {
  rows: HomeMonthlyChargeLedgerRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  summary: HomeMonthlyChargesLedgerSummary;
} = {
  rows: [],
  totalCount: 0,
  page: 1,
  pageSize: DEFAULT_CHARGES_LEDGER_PAGE_SIZE,
  summary: {
    totalBilledMinor: 0,
    chargeCount: 0,
    paidCount: 0,
    unpaidCount: 0,
    unpaidBalanceMinor: 0,
  },
};

export default async function ChargesPage({ searchParams }: ChargesPageProps) {
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
  const paymentStatus = parsePaymentStatusParam(
    typeof q.paymentStatus === "string" ? q.paymentStatus : undefined,
  );
  const chargesLedger =
    selectedHomeId && homeRow
      ? listHomeMonthlyChargesLedger(db, actor, selectedHomeId, {
          ...monthRange,
          paymentStatus,
          page,
          pageSize,
        })
      : emptyChargesLedger;

  return (
    <main className="flex flex-col gap-7 text-ink">
      <div className="village-reveal relative isolate overflow-hidden rounded-3xl border border-pine/12 bg-cream/85 px-5 py-6 shadow-[0_22px_60px_-36px_rgba(12,24,20,0.45)] sm:px-7">
        <div className="absolute inset-y-0 right-0 -z-10 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(184,71,50,0.18),transparent_46%),radial-gradient(circle_at_bottom_right,rgba(26,77,58,0.15),transparent_42%)]" />
        <div className="flex max-w-3xl flex-col gap-3">
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-terracotta">
            Admin ledger
          </p>
          <h1 className="village-page-title text-4xl">Monthly charges</h1>
          <p className="max-w-2xl text-sm leading-6 text-ink/70">
            Review generated resident charges by home, billing range, and
            payment status.
          </p>
        </div>
      </div>
      <HomeChargesSection
        homes={homeOptions}
        selectedHomeId={selectedHomeId}
        defaultCurrencyCode={homeRow?.defaultCurrencyCode ?? DEFAULT_CURRENCY_CODE}
        billingMonthFrom={monthRange.billingMonthFrom}
        billingMonthTo={monthRange.billingMonthTo}
        ytdBillingMonthFrom={ytd.billingMonthFrom}
        ytdBillingMonthTo={ytd.billingMonthTo}
        rangeIsDefaultYtd={rangeIsDefaultYtd}
        paymentStatus={paymentStatus}
        ledger={chargesLedger}
      />
    </main>
  );
}

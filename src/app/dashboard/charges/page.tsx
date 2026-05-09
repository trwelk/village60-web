import { getDb } from "@/db/client";
import { homes, residents } from "@/db/schema";
import {
  resolveLedgerBillingMonthRange,
  utcYearToDateBillingMonthRange,
} from "@/lib/billing/billingMonth";
import {
  DEFAULT_CHARGES_LEDGER_PAGE_SIZE,
  listHomeMonthlyChargesLedger,
  MAX_CHARGES_LEDGER_PAGE_SIZE,
  type HomeMonthlyChargeLedgerRow,
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
    residentId?: string;
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
    return DEFAULT_CHARGES_LEDGER_PAGE_SIZE;
  }
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) {
    return DEFAULT_CHARGES_LEDGER_PAGE_SIZE;
  }
  return Math.min(MAX_CHARGES_LEDGER_PAGE_SIZE, n);
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
  const selectedResidentIdRaw =
    typeof q.residentId === "string" ? q.residentId.trim() : "";
  const residentOptions = selectedHomeId
    ? db
        .select({
          residentId: residents.id,
          residentFullName: residents.fullName,
          residentStatus: residents.status,
        })
        .from(residents)
        .where(eq(residents.homeId, selectedHomeId))
        .all()
        .sort((a, b) => a.residentFullName.localeCompare(b.residentFullName))
    : [];
  const selectedResidentId = residentOptions.some(
    (r) => r.residentId === selectedResidentIdRaw,
  )
    ? selectedResidentIdRaw
    : null;
  const chargesLedger =
    selectedHomeId && homeRow
      ? listHomeMonthlyChargesLedger(db, actor, selectedHomeId, {
          ...monthRange,
          residentId: selectedResidentId,
          paymentStatus: "all",
          page,
          pageSize,
        })
      : emptyChargesLedger;

  return (
    <main className="flex flex-col gap-7 text-[var(--text-primary)]">
      <HomeChargesSection
        homes={homeOptions}
        selectedHomeId={selectedHomeId}
        defaultCurrencyCode={homeRow?.defaultCurrencyCode ?? DEFAULT_CURRENCY_CODE}
        billingMonthFrom={monthRange.billingMonthFrom}
        billingMonthTo={monthRange.billingMonthTo}
        ytdBillingMonthFrom={ytd.billingMonthFrom}
        ytdBillingMonthTo={ytd.billingMonthTo}
        rangeIsDefaultYtd={rangeIsDefaultYtd}
        selectedResidentId={selectedResidentId}
        residentOptions={residentOptions}
        ledger={chargesLedger}
      />
    </main>
  );
}

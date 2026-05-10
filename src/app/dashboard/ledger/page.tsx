import { getDb } from "@/db/client";
import { residents } from "@/db/schema";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import {
  listResidentBillingAccountsForHome,
  type ResidentBillingAccountSummary,
} from "@/lib/billing/paymentsLifecycle";
import {
  resolvePostedLedgerDateRange,
  utcYearToDatePostedDateRange,
} from "@/lib/billing/postedDateRange";
import { listHomes } from "@/lib/homes/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { eq } from "drizzle-orm";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LedgerDashboardClient } from "./LedgerDashboardClient";

type DashboardLedgerPageProps = {
  searchParams?: Promise<{
    homeId?: string;
    resident?: string;
    residentId?: string;
    accountType?: string;
    postedFrom?: string;
    postedTo?: string;
  }>;
};

function mapAccountsToResidentOptions(accounts: ResidentBillingAccountSummary[]) {
  return accounts.map((a) => ({
    residentId: a.residentId,
    residentFullName: a.fullName,
    residentStatus: a.status,
  }));
}

export default async function DashboardLedgerPage({
  searchParams,
}: DashboardLedgerPageProps) {
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
  const homes = listHomes(db, actor).map((home) => ({
    homeId: home.id,
    homeName: home.name,
    defaultCurrencyCode: home.defaultCurrencyCode,
  }));
  const q = searchParams ? await searchParams : {};

  let selectedHomeId = typeof q.homeId === "string" ? q.homeId : "";
  if (selectedHomeId && !homes.some((home) => home.homeId === selectedHomeId)) {
    selectedHomeId = "";
  }

  const rawAccountType =
    typeof q.accountType === "string" ? q.accountType.trim() : "";
  let selectedAccountType =
    rawAccountType === "home" ? ("home" as const) : ("resident" as const);

  const requestedResidentId =
    (typeof q.resident === "string" ? q.resident : q.residentId)?.trim() ?? "";

  if (
    requestedResidentId &&
    selectedAccountType === "resident" &&
    requestedResidentId.length > 0
  ) {
    const residentHome = db
      .select({ homeId: residents.homeId })
      .from(residents)
      .where(eq(residents.id, requestedResidentId))
      .get();
    if (
      residentHome &&
      homes.some((home) => home.homeId === residentHome.homeId)
    ) {
      selectedHomeId = residentHome.homeId;
    }
  }

  if (!selectedHomeId) {
    selectedHomeId = homes[0]?.homeId ?? "";
  }

  const accounts = selectedHomeId
    ? listResidentBillingAccountsForHome(db, actor, selectedHomeId)
    : [];

  let selectedResidentId =
    requestedResidentId && accounts.some((a) => a.residentId === requestedResidentId)
      ? requestedResidentId
      : null;
  if (selectedAccountType === "home") {
    selectedResidentId = null;
  }

  const atMs = Date.now();
  const ytd = utcYearToDatePostedDateRange(atMs);
  const range = resolvePostedLedgerDateRange(
    typeof q.postedFrom === "string" ? q.postedFrom : undefined,
    typeof q.postedTo === "string" ? q.postedTo : undefined,
    atMs,
  );
  return (
    <main className="flex flex-col gap-7 text-[var(--text-primary)]">
      <LedgerDashboardClient
        homes={homes}
        selectedHomeId={selectedHomeId}
        selectedAccountType={selectedAccountType}
        selectedResidentId={selectedResidentId}
        residentOptions={mapAccountsToResidentOptions(accounts)}
        postedFrom={range.postedFrom}
        postedTo={range.postedTo}
        ytdPostedFrom={ytd.postedFrom}
        ytdPostedTo={ytd.postedTo}
      />
    </main>
  );
}

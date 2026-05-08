import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { listResidentBillingAccountsForHome } from "@/lib/billing/paymentsLifecycle";
import { ForbiddenError, NotFoundError } from "@/lib/homes/errors";
import { listHomes } from "@/lib/homes/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { InvoicesDashboardClient } from "./InvoicesDashboardClient";

type PageParams = {
  searchParams?: Promise<{ homeId?: string }>;
};

export default async function DashboardInvoicesPage({ searchParams }: PageParams) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  if (!session.userId) {
    redirect("/login");
  }
  const actor = requireSessionActor(session);
  const db = getDb();

  const homes = listHomes(db, actor).map((h) => ({
    homeId: h.id,
    homeName: h.name,
    defaultCurrencyCode: h.defaultCurrencyCode,
  }));

  const q = searchParams ? await searchParams : {};
  let selectedHomeId = typeof q.homeId === "string" ? q.homeId : "";
  if (selectedHomeId && !homes.some((h) => h.homeId === selectedHomeId)) {
    selectedHomeId = "";
  }
  if (!selectedHomeId && homes.length > 0) {
    selectedHomeId = homes[0]!.homeId;
  }

  if (homes.length === 0) {
    return (
      <main className="flex flex-col gap-6 text-[var(--text-primary)]">
        <InvoicesDashboardClient homes={[]} selectedHomeId="" accounts={[]} />
      </main>
    );
  }

  let accounts;
  try {
    accounts = listResidentBillingAccountsForHome(db, actor, selectedHomeId);
  } catch (e) {
    if (e instanceof ForbiddenError) {
      redirect("/dashboard");
    }
    if (e instanceof NotFoundError && homes[0]) {
      selectedHomeId = homes[0].homeId;
      accounts = listResidentBillingAccountsForHome(db, actor, selectedHomeId);
    } else {
      throw e;
    }
  }

  return (
    <main className="flex flex-col gap-6 text-[var(--text-primary)]">
      <InvoicesDashboardClient
        homes={homes}
        selectedHomeId={selectedHomeId}
        accounts={accounts}
      />
    </main>
  );
}

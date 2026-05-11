import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { listResidentBillingAccountsForHome } from "@/lib/billing/paymentsLifecycle";
import { ForbiddenError, NotFoundError } from "@/lib/homes/errors";
import { listHomes } from "@/lib/homes/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { DashboardDetailRouteSkeleton } from "@/components/VillageListSkeleton";
import { Suspense } from "react";
import { LedgerPageUI } from "./LedgerPageUI";

type PageParams = { params: Promise<{ id: string }> };

export default async function HomeLedgerPage({ params }: PageParams) {
  const { id: homeId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  if (!session.userId) {
    redirect("/login");
  }
  const actor = requireSessionActor(session);
  const db = getDb();
  const home = listHomes(db, actor).find((h) => h.id === homeId);
  if (!home) {
    notFound();
  }

  let accounts;
  try {
    accounts = listResidentBillingAccountsForHome(db, actor, homeId);
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof NotFoundError) {
      notFound();
    }
    throw e;
  }

  return (
    <Suspense fallback={<DashboardDetailRouteSkeleton />}>
      <LedgerPageUI
        homeId={homeId}
        homeName={home.name}
        defaultCurrencyCode={home.defaultCurrencyCode}
        accounts={accounts}
      />
    </Suspense>
  );
}

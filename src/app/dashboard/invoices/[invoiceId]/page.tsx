import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { listResidentBillingAccountsForHome } from "@/lib/billing/paymentsLifecycle";
import { ForbiddenError, NotFoundError } from "@/lib/homes/errors";
import { listHomes } from "@/lib/homes/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { InvoiceDetailClient } from "./InvoiceDetailClient";

type PageParams = {
  params: Promise<{ invoiceId: string }>;
  searchParams?: Promise<{ homeId?: string }>;
};

export default async function DashboardInvoiceDetailPage({ params, searchParams }: PageParams) {
  const { invoiceId } = await params;
  const q = searchParams ? await searchParams : {};
  const homeIdFromQuery = typeof q.homeId === "string" ? q.homeId.trim() : "";
  if (!homeIdFromQuery) {
    redirect(`/dashboard/invoices`);
  }

  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  if (!session.userId) {
    redirect("/login");
  }
  const actor = requireSessionActor(session);
  const db = getDb();
  const home = listHomes(db, actor).find((h) => h.id === homeIdFromQuery);
  if (!home) {
    notFound();
  }

  let accounts;
  try {
    accounts = listResidentBillingAccountsForHome(db, actor, homeIdFromQuery);
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof NotFoundError) {
      notFound();
    }
    throw e;
  }

  return (
    <Suspense
      fallback={
        <main className="flex flex-col gap-8 text-ink">
          <p className="text-sm text-ink/70">Loading invoice…</p>
        </main>
      }
    >
      <InvoiceDetailClient
        homeId={homeIdFromQuery}
        homeName={home.name}
        invoiceId={invoiceId}
        defaultCurrencyCode={home.defaultCurrencyCode}
        accounts={accounts}
      />
    </Suspense>
  );
}

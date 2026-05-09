import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { DEFAULT_CURRENCY_CODE, listHomes } from "@/lib/homes/service";
import { getPurchaseOrderSummary } from "@/lib/inventory/purchaseOrders";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PurchaseOrderDetailClient } from "./PurchaseOrderDetailClient";

type PageProps = {
  params: Promise<{ purchaseOrderId: string }>;
  searchParams?: Promise<{ homeId?: string }>;
};

export default async function PurchaseOrderDetailPage({ params, searchParams }: PageProps) {
  const session = await getIronSession<SessionData>(await cookies(), getSessionOptions());
  if (!session.userId) {
    redirect("/login");
  }

  const actor = requireSessionActor(session);
  const db = getDb();
  const route = await params;
  const homesAll = listHomes(db, actor);
  const homes = homesAll.map((h) => ({ homeId: h.id, homeName: h.name }));
  const q = searchParams ? await searchParams : {};
  let selectedHomeId = "";
  try {
    selectedHomeId = getPurchaseOrderSummary(db, actor, route.purchaseOrderId).homeId;
  } catch {
    // Backward-compatible fallback for inaccessible/missing orders.
    selectedHomeId = typeof q.homeId === "string" ? q.homeId : "";
  }
  if (selectedHomeId && !homes.some((home) => home.homeId === selectedHomeId)) {
    selectedHomeId = "";
  }
  if (!selectedHomeId && homes.length > 0) {
    selectedHomeId = homes[0].homeId;
  }

  const selectedHomeCurrencyCode =
    homesAll.find((h) => h.id === selectedHomeId)?.defaultCurrencyCode ?? DEFAULT_CURRENCY_CODE;

  return (
    <main className="flex flex-col gap-8 text-[var(--text-primary)]">
      <PurchaseOrderDetailClient
        homes={homes}
        selectedHomeId={selectedHomeId}
        selectedHomeCurrencyCode={selectedHomeCurrencyCode}
        purchaseOrderId={route.purchaseOrderId}
      />
    </main>
  );
}

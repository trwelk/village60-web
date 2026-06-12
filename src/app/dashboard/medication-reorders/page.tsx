import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { listHomes } from "@/lib/homes/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MedicationReordersClient } from "./MedicationReordersClient";

type PageParams = {
  searchParams?: Promise<{ homeId?: string }>;
};

export default async function MedicationReordersPage({ searchParams }: PageParams) {
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
    medLowStockDaysThreshold: h.medLowStockDaysThreshold,
    medLowStockServingsThreshold: h.medLowStockServingsThreshold,
    medReorderDaysSupply: h.medReorderDaysSupply,
    medReorderServingsSupply: h.medReorderServingsSupply,
  }));
  const q = searchParams ? await searchParams : {};
  let selectedHomeId = typeof q.homeId === "string" ? q.homeId : "";
  if (selectedHomeId && !homes.some((h) => h.homeId === selectedHomeId)) {
    selectedHomeId = "";
  }
  if (!selectedHomeId && homes.length > 0) {
    selectedHomeId = homes[0].homeId;
  }

  return (
    <main className="flex flex-col gap-7 text-[var(--text-primary)]">
      <MedicationReordersClient homes={homes} selectedHomeId={selectedHomeId} />
    </main>
  );
}

import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { listHomes } from "@/lib/homes/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminSettingsClient } from "./AdminSettingsClient";

export default async function DashboardAdminSettingsPage() {
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
  const homes = listHomes(getDb(), actor).map((h) => ({
    id: h.id,
    name: h.name,
    medLowStockDaysThreshold: h.medLowStockDaysThreshold,
    medLowStockServingsThreshold: h.medLowStockServingsThreshold,
    medReorderDaysSupply: h.medReorderDaysSupply,
    medReorderServingsSupply: h.medReorderServingsSupply,
  }));

  return (
    <main className="flex flex-col gap-7 text-[var(--text-primary)]">
      <AdminSettingsClient homes={homes} />
    </main>
  );
}

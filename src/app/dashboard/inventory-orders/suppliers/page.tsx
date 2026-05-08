import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { listHomes } from "@/lib/homes/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SuppliersPageClient } from "./SuppliersPageClient";

export default async function InventorySuppliersPage() {
  const session = await getIronSession<SessionData>(await cookies(), getSessionOptions());
  if (!session.userId) {
    redirect("/login");
  }
  const actor = requireSessionActor(session);
  const db = getDb();
  const canManageSuppliers = listHomes(db, actor).length > 0;

  return (
    <main className="flex flex-col gap-8 text-[var(--text-primary)]">
      <SuppliersPageClient canManageSuppliers={canManageSuppliers} />
    </main>
  );
}

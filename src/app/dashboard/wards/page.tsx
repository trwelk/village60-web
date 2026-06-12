import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { resolveSelectedHomeId } from "@/lib/dashboard/resolveSelectedHomeId";
import { listHomes } from "@/lib/homes/service";
import { listWardsForHome } from "@/lib/wards/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { WardsPageClient } from "./WardsPageClient";

type PageParams = {
  searchParams: Promise<{ homeId?: string }>;
};

export default async function DashboardWardsPage({ searchParams }: PageParams) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  if (!session.userId) {
    redirect("/login");
  }
  const actor = requireSessionActor(session);
  const db = getDb();
  const homes = listHomes(db, actor);
  if (homes.length === 0) {
    notFound();
  }

  const sp = await searchParams;
  const selectedHomeId = resolveSelectedHomeId(sp.homeId, homes);
  const home = homes.find((h) => h.id === selectedHomeId);
  if (!home) {
    notFound();
  }

  const wards = listWardsForHome(db, actor, selectedHomeId);

  return (
    <WardsPageClient
      homes={homes.map((h) => ({ id: h.id, name: h.name }))}
      selectedHomeId={selectedHomeId}
      home={home}
      role={actor.role}
      initialWards={wards}
    />
  );
}

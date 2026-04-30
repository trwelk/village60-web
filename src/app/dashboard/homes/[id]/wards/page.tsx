import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { listHomes } from "@/lib/homes/service";
import { listWardsForHome } from "@/lib/wards/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { WardsAdminUI } from "./WardsAdminUI";

type PageParams = { params: Promise<{ id: string }> };

export default async function HomeWardsPage({ params }: PageParams) {
  const { id: homeId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  if (!session.userId) {
    redirect("/login");
  }
  const actor = requireSessionActor(session);
  const homes = listHomes(getDb(), actor);
  const home = homes.find((h) => h.id === homeId);
  if (!home) {
    notFound();
  }
  const wards = listWardsForHome(getDb(), actor, homeId);
  return <WardsAdminUI home={home} initialWards={wards} />;
}

import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { listHomes } from "@/lib/homes/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HomeLowStockClient } from "./HomeLowStockClient";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function HomeMedicationsLowStockPage({ params }: PageProps) {
  const { id: homeId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  if (!session.userId) {
    redirect("/login");
  }
  const actor = requireSessionActor(session);
  const homesList = listHomes(getDb(), actor);
  const home = homesList.find((h) => h.id === homeId);
  if (!home) {
    redirect("/dashboard/homes");
  }

  return (
    <HomeLowStockClient
      homeId={homeId}
      homeLabel={home.name}
      role={actor.role}
    />
  );
}

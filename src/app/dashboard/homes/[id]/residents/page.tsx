import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { listHomes } from "@/lib/homes/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { VillageListSkeleton } from "@/components/VillageListSkeleton";
import { ResidentsDirectoryUI } from "@/app/dashboard/residents/ResidentsDirectoryUI";
import { Suspense } from "react";

type PageParams = {
  params: Promise<{ id: string }>;
};

export default async function HomeResidentsPage({
  params,
}: PageParams) {
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
    redirect("/dashboard/homes");
  }

  return (
    <Suspense fallback={<VillageListSkeleton rows={6} cols={5} />}>
      <ResidentsDirectoryUI
        homes={homes.map((h) => ({ id: h.id, name: h.name }))}
        role={actor.role === "admin" ? "admin" : "care"}
        fixedHomeId={homeId}
      />
    </Suspense>
  );
}

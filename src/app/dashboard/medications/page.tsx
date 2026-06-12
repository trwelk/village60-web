import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { resolveSelectedHomeId } from "@/lib/dashboard/resolveSelectedHomeId";
import { listHomes } from "@/lib/homes/service";
import { listResidentClinical } from "@/lib/residents/clinical";
import { listResidents } from "@/lib/residents/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { DashboardDetailRouteSkeleton } from "@/components/VillageListSkeleton";
import { Suspense } from "react";
import { ResidentMedicationsPageClient } from "@/app/dashboard/residents/[residentId]/medications/ResidentMedicationsPageClient";

type PageParams = {
  searchParams: Promise<{ homeId?: string; residentId?: string }>;
};

export default async function DashboardMedicationsPage({
  searchParams,
}: PageParams) {
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

  const homeResidents = listResidents(db, actor, {
    homeId: selectedHomeId,
    status: "all",
  });

  const resolvedResidentId =
    sp.residentId && homeResidents.some((r) => r.id === sp.residentId)
      ? sp.residentId
      : homeResidents[0]?.id;

  if (!resolvedResidentId) {
    notFound();
  }

  const resident = homeResidents.find((r) => r.id === resolvedResidentId);
  const medications = listResidentClinical(
    db,
    actor,
    selectedHomeId,
    resolvedResidentId,
  ).medications;

  return (
    <Suspense fallback={<DashboardDetailRouteSkeleton />}>
      <ResidentMedicationsPageClient
        homes={homes.map((h) => ({ id: h.id, name: h.name }))}
        homeId={selectedHomeId}
        homeName={home.name}
        role={actor.role}
        residentId={resolvedResidentId}
        residentName={resident?.fullName ?? ""}
        homeResidents={homeResidents.map((r) => ({
          id: r.id,
          name: r.fullName,
        }))}
        medications={medications}
      />
    </Suspense>
  );
}

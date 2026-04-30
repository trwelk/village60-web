import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { listHomes } from "@/lib/homes/service";
import { listCareStaffForHome } from "@/lib/users/service";
import { listWardsForHome } from "@/lib/wards/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ResidentsDirectoryUI } from "@/app/dashboard/residents/ResidentsDirectoryUI";
import { ResidentEditor } from "./ResidentEditor";

type PageParams = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ newResident?: string }>;
};

export default async function HomeResidentsPage({
  params,
  searchParams,
}: PageParams) {
  const { id: homeId } = await params;
  const sp = searchParams ? await searchParams : undefined;
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
  const openCreateModal = sp?.newResident === "1";
  const wards = listWardsForHome(getDb(), actor, homeId);
  const careStaffOptions = listCareStaffForHome(getDb(), actor, homeId);

  return (
    <>
      <ResidentsDirectoryUI
        homes={homes.map((h) => ({ id: h.id, name: h.name }))}
        role={actor.role === "admin" ? "admin" : "care"}
        fixedHomeId={homeId}
      />
      {openCreateModal ? (
        <ResidentEditor
          mode="create"
          homeId={homeId}
          homeName={home.name}
          wards={wards.map((w) => ({ id: w.id, label: w.label }))}
          careStaffOptions={careStaffOptions}
        />
      ) : null}
    </>
  );
}

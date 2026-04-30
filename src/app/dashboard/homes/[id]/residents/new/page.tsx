import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { ForbiddenError } from "@/lib/homes/errors";
import { listHomes } from "@/lib/homes/service";
import { listWardsForHome } from "@/lib/wards/service";
import { listCareStaffForHome } from "@/lib/users/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ResidentEditor } from "../ResidentEditor";

type PageParams = { params: Promise<{ id: string }> };

export default async function NewResidentPage({ params }: PageParams) {
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
  let wards;
  let careStaffOptions;
  try {
    wards = listWardsForHome(getDb(), actor, homeId);
    careStaffOptions = listCareStaffForHome(getDb(), actor, homeId);
  } catch (e) {
    if (e instanceof ForbiddenError) {
      notFound();
    }
    throw e;
  }

  return (
    <ResidentEditor
      mode="create"
      homeId={homeId}
      homeName={home.name}
      wards={wards.map((w) => ({ id: w.id, label: w.label }))}
      careStaffOptions={careStaffOptions}
    />
  );
}

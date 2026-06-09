import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { ForbiddenError, NotFoundError } from "@/lib/homes/errors";
import { listHomes } from "@/lib/homes/service";
import {
  getResident,
  residentViewForActor,
} from "@/lib/residents/service";
import { listWardsForHome } from "@/lib/wards/service";
import { listCareStaffForHome } from "@/lib/users/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ResidentDetailShell } from "../ResidentDetailShell";

type PageParams = {
  params: Promise<{ id: string; residentId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
};

export default async function ResidentDetailPage({
  params,
  searchParams,
}: PageParams) {
  const { id: homeId, residentId } = await params;
  const sp = await searchParams;
  const tabRaw = sp.tab;
  const tab = Array.isArray(tabRaw) ? tabRaw[0] : tabRaw;

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
  let resident;
  let wards;
  let careStaffOptions;
  try {
    resident = residentViewForActor(
      actor,
      getResident(getDb(), actor, homeId, residentId),
    );
    wards = listWardsForHome(getDb(), actor, homeId);
    careStaffOptions = listCareStaffForHome(getDb(), actor, homeId);
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof NotFoundError) {
      notFound();
    }
    throw e;
  }

  return (
    <ResidentDetailShell
      homeId={homeId}
      homeDefaultCurrencyCode={home.defaultCurrencyCode}
      userRole={actor.role}
      resident={resident}
      wards={wards.map((w) => ({ id: w.id, label: w.label }))}
      careStaffOptions={careStaffOptions}
    />
  );
}

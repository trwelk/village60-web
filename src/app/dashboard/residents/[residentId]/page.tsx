import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { ForbiddenError, NotFoundError } from "@/lib/homes/errors";
import { listHomes } from "@/lib/homes/service";
import {
  getResidentById,
  listResidents,
  residentViewForActor,
} from "@/lib/residents/service";
import { listWardsForHome } from "@/lib/wards/service";
import { listCareStaffForHome } from "@/lib/users/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ResidentDetailPageClient } from "./ResidentDetailPageClient";

type PageParams = {
  params: Promise<{ residentId: string }>;
};

export default async function FlatResidentDetailPage({ params }: PageParams) {
  const { residentId } = await params;
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

  let residentRow;
  try {
    residentRow = getResidentById(db, actor, residentId);
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof NotFoundError) {
      notFound();
    }
    throw e;
  }

  const homeId = residentRow.homeId;
  const home = homes.find((h) => h.id === homeId);
  if (!home) {
    notFound();
  }

  let wards;
  let careStaffOptions;
  let homeResidents;
  try {
    wards = listWardsForHome(db, actor, homeId);
    careStaffOptions = listCareStaffForHome(db, actor, homeId);
    homeResidents = listResidents(db, actor, { homeId, status: "all" });
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof NotFoundError) {
      notFound();
    }
    throw e;
  }

  const resident = residentViewForActor(actor, residentRow);

  return (
    <ResidentDetailPageClient
      homes={homes.map((h) => ({ id: h.id, name: h.name }))}
      homeId={homeId}
      homeName={home.name}
      homeDefaultCurrencyCode={home.defaultCurrencyCode}
      userRole={actor.role}
      resident={resident}
      homeResidents={homeResidents.map((r) => ({
        id: r.id,
        name: r.fullName,
      }))}
      wards={wards.map((w) => ({ id: w.id, label: w.label }))}
      careStaffOptions={careStaffOptions}
    />
  );
}

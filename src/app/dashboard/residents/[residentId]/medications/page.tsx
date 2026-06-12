import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { ForbiddenError, NotFoundError } from "@/lib/homes/errors";
import { listHomes } from "@/lib/homes/service";
import { listResidentClinical } from "@/lib/residents/clinical";
import {
  getResidentById,
  listResidents,
} from "@/lib/residents/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ResidentMedicationsPageClient } from "./ResidentMedicationsPageClient";

type PageParams = {
  params: Promise<{ residentId: string }>;
};

export default async function FlatResidentMedicationsPage({
  params,
}: PageParams) {
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

  let homeId: string;
  try {
    homeId = getResidentById(db, actor, residentId).homeId;
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof NotFoundError) {
      notFound();
    }
    throw e;
  }

  if (!homes.some((home) => home.id === homeId)) {
    notFound();
  }

  const home = homes.find((h) => h.id === homeId);
  if (!home) {
    notFound();
  }

  let medications: ReturnType<typeof listResidentClinical>["medications"] = [];
  let homeResidents;
  let residentName = "";
  try {
    const resident = getResidentById(db, actor, residentId);
    residentName = resident.fullName;
    medications = listResidentClinical(
      db,
      actor,
      homeId,
      residentId,
    ).medications;
    homeResidents = listResidents(db, actor, { homeId, status: "all" });
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof NotFoundError) {
      notFound();
    }
    throw e;
  }

  return (
    <ResidentMedicationsPageClient
      homes={homes.map((h) => ({ id: h.id, name: h.name }))}
      homeId={homeId}
      homeName={home.name}
      role={actor.role}
      residentId={residentId}
      residentName={residentName}
      homeResidents={homeResidents.map((r) => ({
        id: r.id,
        name: r.fullName,
      }))}
      medications={medications}
    />
  );
}

import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { ForbiddenError, NotFoundError } from "@/lib/homes/errors";
import { resolveSelectedHomeId } from "@/lib/dashboard/resolveSelectedHomeId";
import { listHomes } from "@/lib/homes/service";
import {
  listDepartedResidentsForHome,
  residentViewForActor,
} from "@/lib/residents/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { DepartedResidentsPageClient } from "./DepartedResidentsPageClient";

type PageParams = {
  searchParams: Promise<{ homeId?: string }>;
};

export default async function DepartedResidentsPage({
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

  let residents;
  try {
    residents = listDepartedResidentsForHome(db, actor, selectedHomeId).map(
      (row) => residentViewForActor(actor, row),
    );
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof NotFoundError) {
      notFound();
    }
    throw e;
  }

  return (
    <DepartedResidentsPageClient
      homes={homes.map((h) => ({ id: h.id, name: h.name }))}
      selectedHomeId={selectedHomeId}
      homeName={home.name}
      role={actor.role}
      residents={residents}
    />
  );
}

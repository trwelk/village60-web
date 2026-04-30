import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { ForbiddenError, NotFoundError } from "@/lib/homes/errors";
import { listHomes } from "@/lib/homes/service";
import { getResident } from "@/lib/residents/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ResidentBreadcrumbRegistration } from "./ResidentBreadcrumbRegistration";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ id: string; residentId: string }>;
};

export default async function ResidentIdLayout({ children, params }: LayoutProps) {
  const { id: homeId, residentId } = await params;
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
  let fullName: string;
  try {
    const r = getResident(getDb(), actor, homeId, residentId);
    fullName = r.fullName;
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof NotFoundError) {
      notFound();
    }
    throw e;
  }
  return (
    <>
      <ResidentBreadcrumbRegistration
        homeId={homeId}
        homeLabel={home.name}
        residentId={residentId}
        residentLabel={fullName}
        role={actor.role}
      />
      {children}
    </>
  );
}

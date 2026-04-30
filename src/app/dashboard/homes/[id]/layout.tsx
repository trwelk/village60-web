import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { listHomes } from "@/lib/homes/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HomeBreadcrumbRegistration } from "./HomeBreadcrumbRegistration";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

export default async function HomeIdLayout({ children, params }: LayoutProps) {
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
    <>
      <HomeBreadcrumbRegistration
        homeId={homeId}
        homeLabel={home.name}
        role={actor.role}
      />
      {children}
    </>
  );
}

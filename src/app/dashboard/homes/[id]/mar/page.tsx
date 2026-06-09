import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { listHomes } from "@/lib/homes/service";
import { getMARForHome } from "@/lib/mar/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { DashboardDetailRouteSkeleton } from "@/components/VillageListSkeleton";
import { Suspense } from "react";
import { MarView } from "./MarView";

type PageParams = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default async function HomeMarPage({ params, searchParams }: PageParams) {
  const { id: homeId } = await params;
  const { date: dateParam } = await searchParams;
  const date =
    dateParam && ISO_DATE_RE.test(dateParam) ? dateParam : todayIsoDate();

  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  if (!session.userId) {
    redirect("/login");
  }
  const actor = requireSessionActor(session);
  const db = getDb();
  const home = listHomes(db, actor).find((h) => h.id === homeId);
  if (!home) {
    notFound();
  }

  const mar = getMARForHome(db, actor, homeId, date);

  return (
    <Suspense fallback={<DashboardDetailRouteSkeleton />}>
      <MarView
        homeId={homeId}
        homeName={home.name}
        initialDate={date}
        initialMar={mar}
      />
    </Suspense>
  );
}

import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { resolveSelectedHomeId } from "@/lib/dashboard/resolveSelectedHomeId";
import { listHomes } from "@/lib/homes/service";
import { getMARForHome } from "@/lib/mar/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { DashboardDetailRouteSkeleton } from "@/components/VillageListSkeleton";
import { Suspense } from "react";
import { MarPageClient } from "./MarPageClient";

type PageParams = {
  searchParams: Promise<{ homeId?: string; date?: string }>;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default async function DashboardMarPage({ searchParams }: PageParams) {
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

  const date =
    sp.date && ISO_DATE_RE.test(sp.date) ? sp.date : todayIsoDate();
  const mar = getMARForHome(db, actor, selectedHomeId, date);

  return (
    <Suspense fallback={<DashboardDetailRouteSkeleton />}>
      <MarPageClient
        homes={homes.map((h) => ({ id: h.id, name: h.name }))}
        selectedHomeId={selectedHomeId}
        homeName={home.name}
        role={actor.role}
        initialDate={date}
        initialMar={mar}
      />
    </Suspense>
  );
}

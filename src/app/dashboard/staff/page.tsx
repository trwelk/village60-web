import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { resolveSelectedHomeId } from "@/lib/dashboard/resolveSelectedHomeId";
import { listHomes } from "@/lib/homes/service";
import {
  buildSalariesDirectoryQueryString,
  salariesDirectoryStateFromSearchParams,
} from "@/lib/salaries/directoryPath";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { VillageListSkeleton } from "@/components/VillageListSkeleton";
import { StaffDirectoryUI } from "./StaffDirectoryUI";
import { Suspense } from "react";

type StaffPageProps = {
  searchParams?: Promise<{
    homeId?: string;
    query?: string;
    status?: string;
    page?: string;
    pageSize?: string;
  }>;
};

export default async function StaffPage({ searchParams }: StaffPageProps) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  if (!session.userId) {
    redirect("/login");
  }
  const actor = requireSessionActor(session);
  const homes = listHomes(getDb(), actor);

  const q = searchParams ? await searchParams : {};
  const sp = new URLSearchParams();
  if (typeof q.homeId === "string") sp.set("homeId", q.homeId);
  if (typeof q.query === "string") sp.set("query", q.query);
  if (typeof q.status === "string") sp.set("status", q.status);
  if (typeof q.page === "string") sp.set("page", q.page);
  if (typeof q.pageSize === "string") sp.set("pageSize", q.pageSize);

  const urlState = salariesDirectoryStateFromSearchParams(sp);
  const resolvedHomeId = resolveSelectedHomeId(urlState.homeId || undefined, homes);
  if (resolvedHomeId && resolvedHomeId !== urlState.homeId) {
    const qs = buildSalariesDirectoryQueryString({
      ...urlState,
      homeId: resolvedHomeId,
    });
    redirect(`/dashboard/staff?${qs}`);
  }

  return (
    <Suspense fallback={<VillageListSkeleton rows={6} cols={5} />}>
      <StaffDirectoryUI
        homes={homes.map((h) => ({
          id: h.id,
          name: h.name,
          defaultCurrencyCode: h.defaultCurrencyCode,
        }))}
        isAdmin={actor.role === "admin"}
      />
    </Suspense>
  );
}

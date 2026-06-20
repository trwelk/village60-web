import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { listHomes } from "@/lib/homes/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ChargesCollectionUI } from "./ChargesCollectionUI";
import { Suspense } from "react";
import { VillageListSkeleton } from "@/components/VillageListSkeleton";

export default async function ChargesCollectionPage() {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  if (!session.userId) {
    redirect("/login");
  }
  const actor = requireSessionActor(session);
  if (actor.role !== "admin") {
    redirect("/dashboard");
  }
  const homes = listHomes(getDb(), actor);

  return (
    <Suspense fallback={<VillageListSkeleton rows={8} cols={5} />}>
      <ChargesCollectionUI
        homes={homes.map((h) => ({
          id: h.id,
          name: h.name,
          defaultCurrencyCode: h.defaultCurrencyCode,
        }))}
      />
    </Suspense>
  );
}

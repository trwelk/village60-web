import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { listHomes } from "@/lib/homes/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ResidentsDirectoryUI } from "./ResidentsDirectoryUI";

export default async function ResidentsPage() {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  if (!session.userId) {
    redirect("/login");
  }
  const actor = requireSessionActor(session);
  const homes = listHomes(getDb(), actor);

  return (
    <ResidentsDirectoryUI
      homes={homes.map((h) => ({ id: h.id, name: h.name }))}
      role={actor.role === "admin" ? "admin" : "care"}
      fixedHomeId={
        actor.role === "care" && homes.length === 1 ? homes[0].id : undefined
      }
    />
  );
}

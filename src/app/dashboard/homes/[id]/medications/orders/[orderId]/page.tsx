import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { listHomes } from "@/lib/homes/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MedicationOrderEditorClient } from "../MedicationOrderEditorClient";

type PageProps = {
  params: Promise<{ id: string; orderId: string }>;
};

export default async function HomeMedicationOrderDetailPage({ params }: PageProps) {
  const { id: homeId, orderId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  if (!session.userId) redirect("/login");
  const actor = requireSessionActor(session);
  const home = listHomes(getDb(), actor).find((h) => h.id === homeId);
  if (!home) redirect("/dashboard/homes");

  return (
    <MedicationOrderEditorClient
      homeId={homeId}
      homeLabel={home.name}
      initialOrderId={orderId}
    />
  );
}

import { getDb } from "@/db/client";
import { listResidentsPerHomeChart } from "@/lib/dashboard/charts";
import {
  listInterestLeadsForAdmin,
  listPublicInterestHomes,
} from "@/lib/homeInterestLeads/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WaitingListAdminUI } from "./WaitingListAdminUI";

export default async function DashboardWaitingListPage() {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  if (!session.userId) {
    redirect("/login");
  }
  if (session.role !== "admin") {
    redirect("/dashboard");
  }
  const db = getDb();
  const leads = listInterestLeadsForAdmin(db, session.role);
  const homes = listPublicInterestHomes(db);
  const residentsPerHome = listResidentsPerHomeChart(db);
  const residentCountByHomeId = Object.fromEntries(
    residentsPerHome.map((r) => [r.homeId, r.residentCount]),
  );
  return (
    <WaitingListAdminUI
      initialLeads={leads}
      homes={homes}
      residentCountByHomeId={residentCountByHomeId}
    />
  );
}

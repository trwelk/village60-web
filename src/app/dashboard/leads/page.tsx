import { getDb } from "@/db/client";
import {
  listInterestLeadsForAdmin,
  listPublicInterestHomes,
} from "@/lib/homeInterestLeads/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LeadsAdminUI } from "./LeadsAdminUI";

export default async function DashboardLeadsPage() {
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
  return <LeadsAdminUI initialLeads={leads} homes={homes} />;
}

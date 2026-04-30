import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { listHomes } from "@/lib/homes/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { listUsersWithAssignments } from "@/lib/users/service";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { UsersAdminUI } from "./UsersAdminUI";

export default async function UsersPage() {
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
  const users = listUsersWithAssignments(db, session.role);
  const homes = listHomes(db, requireSessionActor(session));
  return <UsersAdminUI initialUsers={users} initialHomes={homes} />;
}

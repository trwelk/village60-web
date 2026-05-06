import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { listExpenseTypes } from "@/lib/expenseTypes/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ExpenseTypesAdminUI } from "./ExpenseTypesAdminUI";

export default async function DashboardExpenseTypesPage() {
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
  const expenseTypes = listExpenseTypes(db, requireSessionActor(session));
  return <ExpenseTypesAdminUI initialExpenseTypes={expenseTypes} />;
}

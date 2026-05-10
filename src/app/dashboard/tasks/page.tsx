import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { listHomes } from "@/lib/homes/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import {
  listTasksForInboxQuery,
  parseTaskInboxQueryFromServerSearchParams,
} from "@/lib/tasks/service";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TasksSection } from "./TasksSection";

type TasksPageProps = {
  searchParams?: Promise<{
    status?: string;
    type?: string;
    home?: string;
  }>;
};

export default async function TasksPage({ searchParams }: TasksPageProps) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  if (!session.userId) {
    redirect("/login");
  }
  const actor = requireSessionActor(session);
  const db = getDb();
  const homes = listHomes(db, actor).map((home) => ({
    id: home.id,
    name: home.name,
  }));
  const q = searchParams ? await searchParams : {};
  const query = parseTaskInboxQueryFromServerSearchParams(q);
  const tasks = listTasksForInboxQuery(db, actor, query);

  return <TasksSection homes={homes} tasks={tasks} query={query} />;
}

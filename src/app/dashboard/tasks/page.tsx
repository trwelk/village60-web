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

  return (
    <main className="flex flex-col gap-7 text-ink">
      <div className="village-reveal relative isolate overflow-hidden rounded-3xl border border-pine/12 bg-cream/85 px-5 py-6 shadow-[0_22px_60px_-36px_rgba(12,24,20,0.45)] sm:px-7">
        <div className="absolute inset-y-0 right-0 -z-10 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(184,71,50,0.18),transparent_46%),radial-gradient(circle_at_bottom_right,rgba(26,77,58,0.15),transparent_42%)]" />
        <div className="flex max-w-3xl flex-col gap-3">
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.24em] text-terracotta">
            Shared inbox
          </p>
          <h1 className="village-page-title text-4xl">Tasks</h1>
          <p className="max-w-2xl text-sm leading-6 text-ink/70">
            Create and manage manual operational tasks for the homes you can
            access. Unpaid monthly charges after the billing month show here as
            reminders until recorded in billing. Upcoming resident birthdays also
            appear here during their 7-day reminder window. Completed manual tasks
            leave this open inbox.
          </p>
        </div>
      </div>
      <TasksSection homes={homes} tasks={tasks} query={query} />
    </main>
  );
}

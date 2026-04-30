import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import {
  DEFAULT_HOMES_PAGE_SIZE,
  listHomesPage,
  MAX_HOMES_PAGE_SIZE,
} from "@/lib/homes/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { HomesAdminUI } from "./HomesAdminUI";

type HomesPageProps = {
  searchParams?: Promise<{
    page?: string;
    pageSize?: string;
  }>;
};

function parsePageParam(raw: string | undefined): number {
  if (raw === undefined || raw === "") {
    return 1;
  }
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) {
    return 1;
  }
  return n;
}

function parsePageSizeParam(raw: string | undefined): number {
  if (raw === undefined || raw === "") {
    return DEFAULT_HOMES_PAGE_SIZE;
  }
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) {
    return DEFAULT_HOMES_PAGE_SIZE;
  }
  return Math.min(MAX_HOMES_PAGE_SIZE, n);
}

export default async function HomesPage({ searchParams }: HomesPageProps) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  if (!session.userId) {
    redirect("/login");
  }
  const actor = requireSessionActor(session);
  const q = searchParams ? await searchParams : {};
  const page = parsePageParam(typeof q.page === "string" ? q.page : undefined);
  const pageSize = parsePageSizeParam(
    typeof q.pageSize === "string" ? q.pageSize : undefined,
  );
  const paged = listHomesPage(getDb(), actor, { page, pageSize });
  return (
    <HomesAdminUI
      initialHomes={paged.rows}
      totalCount={paged.totalCount}
      page={paged.page}
      pageSize={paged.pageSize}
      variant={actor.role === "admin" ? "admin" : "care"}
    />
  );
}

import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import {
  DEFAULT_RESIDENTS_DIRECTORY_PAGE_SIZE,
  listResidentsPaged,
  MAX_RESIDENTS_DIRECTORY_PAGE_SIZE,
  residentViewForActor,
} from "@/lib/residents/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function parseStatus(
  raw: string | null,
): "active" | "departed" | "all" | undefined {
  if (raw === null || raw === "") {
    return undefined;
  }
  if (raw === "active" || raw === "departed" || raw === "all") {
    return raw;
  }
  return undefined;
}

function parsePositiveInt(raw: string | null, fallback: number): number {
  if (raw === null || raw === "") {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) {
    return fallback;
  }
  return n;
}

/** Directory listing: optional home filter (Admin); Care is always limited to assigned homes. */
export async function GET(req: Request) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const url = new URL(req.url);
  const homeId = url.searchParams.get("homeId") ?? undefined;
  const query = url.searchParams.get("query") ?? undefined;
  const statusParam = url.searchParams.get("status");
  const status = parseStatus(statusParam);
  if (statusParam !== null && statusParam !== "" && status === undefined) {
    return NextResponse.json(
      { error: "status must be active, departed, or all." },
      { status: 400 },
    );
  }
  const wardId = url.searchParams.get("wardId") ?? undefined;
  const page = parsePositiveInt(url.searchParams.get("page"), 1);
  const pageSize = Math.min(
    MAX_RESIDENTS_DIRECTORY_PAGE_SIZE,
    Math.max(
      1,
      parsePositiveInt(
        url.searchParams.get("pageSize"),
        DEFAULT_RESIDENTS_DIRECTORY_PAGE_SIZE,
      ),
    ),
  );

  try {
    const actor = requireSessionActor(session);
    const out = listResidentsPaged(getDb(), actor, {
      ...(homeId !== undefined ? { homeId } : {}),
      ...(query !== undefined ? { query } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(wardId !== undefined ? { wardId } : {}),
    }, { page, pageSize });
    const residents = out.residents.map((r) => residentViewForActor(actor, r));
    return NextResponse.json({
      residents,
      totalCount: out.totalCount,
      page: out.page,
      pageSize: out.pageSize,
    });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

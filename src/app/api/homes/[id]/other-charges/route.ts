import { getDb } from "@/db/client";
import {
  DEFAULT_CHARGES_LEDGER_PAGE_SIZE,
  listHomeOtherChargesLedger,
  MAX_CHARGES_LEDGER_PAGE_SIZE,
  type HomeOtherChargesReceivedFilter,
} from "@/lib/billing/residentCharges";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

function parseReceivedFilter(
  raw: string | null,
): { ok: true; value: HomeOtherChargesReceivedFilter } | { ok: false } {
  const s = (raw ?? "").trim();
  if (s === "" || s === "all") {
    return { ok: true, value: "all" };
  }
  if (s === "unpaid") {
    return { ok: true, value: "unpaid" };
  }
  if (s === "paid") {
    return { ok: true, value: "paid" };
  }
  return { ok: false };
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

export async function GET(req: Request, { params }: RouteParams) {
  const { id: homeId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const url = new URL(req.url);
  const residentId = (url.searchParams.get("residentId") ?? "").trim();
  const statusParsed = parseReceivedFilter(url.searchParams.get("status"));
  if (!statusParsed.ok) {
    return NextResponse.json(
      { error: "status must be all, unpaid, or paid." },
      { status: 400 },
    );
  }
  const page = parsePositiveInt(url.searchParams.get("page"), 1);
  const pageSize = Math.min(
    MAX_CHARGES_LEDGER_PAGE_SIZE,
    Math.max(
      1,
      parsePositiveInt(
        url.searchParams.get("pageSize"),
        DEFAULT_CHARGES_LEDGER_PAGE_SIZE,
      ),
    ),
  );
  try {
    const actor = requireSessionActor(session);
    const db = getDb();
    const out = listHomeOtherChargesLedger(db, actor, homeId, {
      residentId: residentId || undefined,
      receivedFilter: statusParsed.value,
      page,
      pageSize,
    });
    return NextResponse.json({
      rows: out.rows,
      totalCount: out.totalCount,
      page: out.page,
      pageSize: out.pageSize,
      summary: out.summary,
    });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) {
      return resp;
    }
    throw e;
  }
}

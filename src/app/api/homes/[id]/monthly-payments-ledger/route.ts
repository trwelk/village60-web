import { getDb } from "@/db/client";
import {
  DEFAULT_PAYMENTS_LEDGER_PAGE_SIZE,
  listHomeMonthlyPaymentsLedger,
  MAX_PAYMENTS_LEDGER_PAGE_SIZE,
} from "@/lib/billing/residentCharges";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

function parsePositiveInt(
  raw: string | null,
  fallback: number,
): number {
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
  const page = parsePositiveInt(
    url.searchParams.get("page"),
    1,
  );
  const pageSize = Math.min(
    MAX_PAYMENTS_LEDGER_PAGE_SIZE,
    Math.max(
      1,
      parsePositiveInt(
        url.searchParams.get("pageSize"),
        DEFAULT_PAYMENTS_LEDGER_PAGE_SIZE,
      ),
    ),
  );
  try {
    const actor = requireSessionActor(session);
    const db = getDb();
    const out = listHomeMonthlyPaymentsLedger(db, actor, homeId, {
      page,
      pageSize,
    });
    return NextResponse.json({
      rows: out.rows,
      totalCount: out.totalCount,
      page: out.page,
      pageSize: out.pageSize,
    });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) {
      return resp;
    }
    throw e;
  }
}

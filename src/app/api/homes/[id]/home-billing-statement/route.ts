import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { getHomeAccountStatement } from "@/lib/billing/homeAccounts";
import { homesErrorResponse } from "@/lib/homes/http";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

/** Same JSON envelope as `/residents/.../billing-statement` for the shared ledger UI. */
export async function GET(_req: Request, { params }: RouteParams) {
  const { id: homeId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    const s = getHomeAccountStatement(getDb(), requireSessionActor(session), homeId);
    const lines =
      !s.accountId
        ? []
        : s.lines.map((line) => ({
            transaction: {
              id: line.id,
              accountId: s.accountId,
              accountType: "home" as const,
              txnType: line.txnType,
              amountMinor: line.amountMinor,
              sourceKind: line.sourceKind,
              sourceId: line.sourceId,
              memo: line.memo,
              recordedByUserId: line.recordedByUserId,
              postedAtUtcMs: line.postedAtUtcMs,
            },
            runningBalanceMinor: line.runningBalanceMinor,
          }));
    return NextResponse.json({
      accountId: s.accountId ?? "",
      currentBalanceMinor: s.currentBalanceMinor,
      lines,
    });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

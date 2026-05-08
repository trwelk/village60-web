import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { reversePostedBillingTransactionForResident } from "@/lib/billing/ledgerReversal";
import { homesErrorResponse } from "@/lib/homes/http";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = {
  params: Promise<{ id: string; residentId: string; transactionId: string }>;
};

export async function POST(req: Request, { params }: RouteParams) {
  const { id: homeId, residentId, transactionId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // optional body
    body = {};
  }
  if (typeof body !== "object" || body === null) {
    body = {};
  }
  const rec = body as Record<string, unknown>;

  let postedAtUtcMs: number | undefined;
  if ("postedAtUtcMs" in rec && rec.postedAtUtcMs !== undefined) {
    if (typeof rec.postedAtUtcMs !== "number") {
      return NextResponse.json(
        { error: "postedAtUtcMs must be a number." },
        { status: 400 },
      );
    }
    postedAtUtcMs = rec.postedAtUtcMs;
  }

  let memo: string | null | undefined;
  if ("memo" in rec) {
    if (typeof rec.memo === "string") {
      memo = rec.memo;
    } else if (rec.memo === null) {
      memo = null;
    } else if (rec.memo !== undefined) {
      return NextResponse.json({ error: "memo must be a string or null." }, { status: 400 });
    }
  }

  try {
    const result = reversePostedBillingTransactionForResident(
      getDb(),
      requireSessionActor(session),
      {
        homeId,
        residentId,
        originalTransactionId: transactionId,
        ...(memo !== undefined ? { memo } : {}),
        ...(postedAtUtcMs !== undefined ? { postedAtUtcMs } : {}),
      },
    );
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

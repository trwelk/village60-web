import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { revertFinalizedInvoiceToDraft } from "@/lib/billing/invoiceLifecycle";
import { homesErrorResponse } from "@/lib/homes/http";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string; invoiceId: string }> };

export async function POST(_req: Request, { params }: RouteParams) {
  const { id: homeId, invoiceId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    const result = revertFinalizedInvoiceToDraft(getDb(), requireSessionActor(session), {
      homeId,
      invoiceId,
      revertedAtUtcMs: Date.now(),
    });
    return NextResponse.json(result);
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

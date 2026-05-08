import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { cancelPurchaseOrderLineRemaining } from "@/lib/inventory/purchaseOrders";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ poId: string; lineId: string }> };

export async function POST(_: Request, { params }: RouteParams) {
  const { poId, lineId } = await params;
  const session = await getIronSession<SessionData>(await cookies(), getSessionOptions());
  try {
    const actor = requireSessionActor(session);
    const result = cancelPurchaseOrderLineRemaining(
      getDb(),
      actor,
      { purchaseOrderId: poId, purchaseOrderLineId: lineId },
      Date.now(),
    );
    return NextResponse.json(result);
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

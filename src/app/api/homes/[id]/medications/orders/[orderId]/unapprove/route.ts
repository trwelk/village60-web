import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { unapproveMedicationOrder } from "@/lib/medicationOrders/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteCtx = { params: Promise<{ id: string; orderId: string }> };

export async function POST(_req: Request, ctx: RouteCtx) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const { id: homeId, orderId } = await ctx.params;

  try {
    const actor = requireSessionActor(session);
    const detail = unapproveMedicationOrder(getDb(), actor, homeId, orderId);
    return NextResponse.json(detail);
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import {
  removeMedicationOrderLine,
  updateMedicationOrderLineQty,
} from "@/lib/medicationOrders/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteCtx = { params: Promise<{ id: string; orderId: string; lineId: string }> };

export async function PATCH(req: Request, ctx: RouteCtx) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const { id: homeId, orderId, lineId } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const b =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const orderedQty =
    typeof b.orderedQty === "number" && Number.isFinite(b.orderedQty) ? b.orderedQty : NaN;
  const orderUnitLabel =
    b.orderUnitLabel === undefined || b.orderUnitLabel === null
      ? undefined
      : String(b.orderUnitLabel);
  if (Number.isNaN(orderedQty)) {
    return NextResponse.json({ error: "orderedQty is required." }, { status: 400 });
  }

  try {
    const actor = requireSessionActor(session);
    const detail = updateMedicationOrderLineQty(
      getDb(),
      actor,
      homeId,
      orderId,
      lineId,
      orderedQty,
      orderUnitLabel,
    );
    return NextResponse.json(detail);
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

export async function DELETE(_req: Request, ctx: RouteCtx) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const { id: homeId, orderId, lineId } = await ctx.params;

  try {
    const actor = requireSessionActor(session);
    const detail = removeMedicationOrderLine(getDb(), actor, homeId, orderId, lineId);
    return NextResponse.json(detail);
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

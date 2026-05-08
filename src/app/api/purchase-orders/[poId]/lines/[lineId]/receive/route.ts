import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { receivePurchaseOrderLine } from "@/lib/inventory/purchaseOrders";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ poId: string; lineId: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  const { poId, lineId } = await params;
  const session = await getIronSession<SessionData>(await cookies(), getSessionOptions());
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const rec = body as Record<string, unknown>;
  const qtyReceivedEvent =
    typeof rec.qtyReceivedEvent === "number"
      ? rec.qtyReceivedEvent
      : Number(rec.qtyReceivedEvent ?? 0);
  const baseUnitsReceivedEvent =
    typeof rec.baseUnitsReceivedEvent === "number"
      ? rec.baseUnitsReceivedEvent
      : Number(rec.baseUnitsReceivedEvent ?? 0);
  const unitPriceCents = Math.round(
    typeof rec.unitPriceCents === "number" ? rec.unitPriceCents : Number(rec.unitPriceCents ?? 0),
  );
  const currencyCode = typeof rec.currencyCode === "string" ? rec.currencyCode : "";
  const receivedAtUtcMs =
    typeof rec.receivedAtUtcMs === "number" ? rec.receivedAtUtcMs : Number(rec.receivedAtUtcMs);
  const note = typeof rec.note === "string" ? rec.note : null;
  try {
    const actor = requireSessionActor(session);
    const result = receivePurchaseOrderLine(
      getDb(),
      actor,
      {
        purchaseOrderId: poId,
        purchaseOrderLineId: lineId,
        qtyReceivedEvent,
        baseUnitsReceivedEvent,
        unitPriceCents,
        currencyCode,
        receivedAtUtcMs,
        note,
      },
      Date.now(),
    );
    return NextResponse.json({ receiveEvent: result }, { status: 201 });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

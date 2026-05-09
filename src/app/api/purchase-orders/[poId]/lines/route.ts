import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { addPurchaseOrderLine } from "@/lib/inventory/purchaseOrders";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ poId: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  const { poId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
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
  const itemId = typeof rec.itemId === "string" ? rec.itemId : "";
  const ownerType = typeof rec.ownerType === "string" ? rec.ownerType : "";
  const ownerId = typeof rec.ownerId === "string" ? rec.ownerId : "";
  const purchaseUnitType =
    typeof rec.purchaseUnitType === "string" ? rec.purchaseUnitType : "";
  const quantityOrderedBaseUnits =
    typeof rec.quantityOrderedBaseUnits === "number"
      ? rec.quantityOrderedBaseUnits
      : Number(rec.quantityOrderedBaseUnits ?? 0);
  try {
    const actor = requireSessionActor(session);
    const line = addPurchaseOrderLine(
      getDb(),
      actor,
      {
        purchaseOrderId: poId,
        itemId,
        ownerType: ownerType as "HOME" | "RESIDENT",
        ownerId,
        purchaseUnitType,
        quantityOrderedBaseUnits,
      },
      Date.now(),
    );
    return NextResponse.json({ line }, { status: 201 });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import {
  adjustInventory,
  type InventoryAdjustmentReasonCode,
  type InventoryOwnerType,
} from "@/lib/inventory/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
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
  if (typeof body !== "object" || body == null) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const rec = body as Record<string, unknown>;
  const ownerType =
    typeof rec.ownerType === "string" ? (rec.ownerType as InventoryOwnerType) : "HOME";
  const ownerId = typeof rec.ownerId === "string" ? rec.ownerId : "";
  const itemId = typeof rec.itemId === "string" ? rec.itemId : "";
  const adjustmentType =
    typeof rec.adjustmentType === "string"
      ? (rec.adjustmentType as "ADJUST_IN" | "ADJUST_OUT")
      : "ADJUST_OUT";
  const quantityBaseUnits =
    typeof rec.quantityBaseUnits === "number"
      ? rec.quantityBaseUnits
      : Number(rec.quantityBaseUnits ?? 0);
  const reasonCode =
    typeof rec.reasonCode === "string"
      ? (rec.reasonCode as InventoryAdjustmentReasonCode)
      : ("OTHER" as InventoryAdjustmentReasonCode);
  const note = typeof rec.note === "string" ? rec.note : null;
  const sourceType = typeof rec.sourceType === "string" ? rec.sourceType : "ADJUSTMENT_UI";
  const sourceId = typeof rec.sourceId === "string" ? rec.sourceId : "";
  try {
    const actor = requireSessionActor(session);
    const transaction = adjustInventory(
      getDb(),
      actor,
      {
        ownerType,
        ownerId,
        itemId,
        adjustmentType,
        quantityBaseUnits,
        reasonCode,
        note,
        sourceType,
        sourceId,
      },
      Date.now(),
    );
    return NextResponse.json({ transaction }, { status: 201 });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

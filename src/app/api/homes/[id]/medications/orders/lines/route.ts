import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { addMedicationOrderLineForResident } from "@/lib/medicationOrders/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: RouteCtx) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const { id: homeId } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const b =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const residentId = typeof b.residentId === "string" ? b.residentId.trim() : "";
  const residentMedicationId =
    typeof b.residentMedicationId === "string" ? b.residentMedicationId.trim() : "";
  const orderedQty =
    typeof b.orderedQty === "number" && Number.isFinite(b.orderedQty) ? b.orderedQty : NaN;
  const orderUnitLabel =
    b.orderUnitLabel === undefined || b.orderUnitLabel === null
      ? undefined
      : String(b.orderUnitLabel);
  if (!residentId || !residentMedicationId || Number.isNaN(orderedQty)) {
    return NextResponse.json(
      { error: "residentId, residentMedicationId, and orderedQty are required." },
      { status: 400 },
    );
  }

  try {
    const actor = requireSessionActor(session);
    const detail = addMedicationOrderLineForResident(
      getDb(),
      actor,
      homeId,
      residentId,
      residentMedicationId,
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

import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import {
  getMedicationOrderDetail,
  patchMedicationOrderApprovedLineQtys,
} from "@/lib/medicationOrders/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteCtx = { params: Promise<{ id: string; orderId: string }> };

export async function GET(_req: Request, ctx: RouteCtx) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const { id: homeId, orderId } = await ctx.params;

  try {
    const actor = requireSessionActor(session);
    const detail = getMedicationOrderDetail(getDb(), actor, homeId, orderId);
    return NextResponse.json(detail);
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

export async function PATCH(req: Request, ctx: RouteCtx) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const { id: homeId, orderId } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const b =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const raw = b.lineOrderedQtyByResidentMedicationId;
  if (raw === undefined || typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return NextResponse.json(
      { error: "lineOrderedQtyByResidentMedicationId object is required." },
      { status: 400 },
    );
  }
  const lineOrderedQtyByResidentMedicationId: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      return NextResponse.json(
        { error: "Each ordered quantity must be a finite number." },
        { status: 400 },
      );
    }
    lineOrderedQtyByResidentMedicationId[k] = v;
  }

  try {
    const actor = requireSessionActor(session);
    const detail = patchMedicationOrderApprovedLineQtys(
      getDb(),
      actor,
      homeId,
      orderId,
      lineOrderedQtyByResidentMedicationId,
    );
    return NextResponse.json(detail);
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

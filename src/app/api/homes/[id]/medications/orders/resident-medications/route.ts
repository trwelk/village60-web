import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { listActiveResidentMedicationOptionsForOrder } from "@/lib/medicationOrders/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: RouteCtx) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const { id: homeId } = await ctx.params;
  const url = new URL(req.url);
  const residentId = url.searchParams.get("residentId")?.trim() ?? "";
  if (!residentId) {
    return NextResponse.json({ error: "residentId is required." }, { status: 400 });
  }

  try {
    const actor = requireSessionActor(session);
    const medications = listActiveResidentMedicationOptionsForOrder(
      getDb(),
      actor,
      homeId,
      residentId,
    );
    return NextResponse.json({ medications });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

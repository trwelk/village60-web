import { getDb } from "@/db/client";
import { listHomeUnpaidMonthlyChargesWorklist } from "@/lib/billing/residentCharges";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { id: homeId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    const actor = requireSessionActor(session);
    const worklist = listHomeUnpaidMonthlyChargesWorklist(
      getDb(),
      actor,
      homeId,
    );
    return NextResponse.json({ worklist });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) {
      return resp;
    }
    throw e;
  }
}

import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { deleteRemittance } from "@/lib/salaries/service";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string; remittanceId: string }> };

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id: homeId, remittanceId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    const actor = requireSessionActor(session);
    deleteRemittance(getDb(), actor, homeId, remittanceId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

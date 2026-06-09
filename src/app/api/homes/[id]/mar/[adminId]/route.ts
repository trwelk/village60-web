import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { undoAdministration } from "@/lib/mar/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string; adminId: string }> };

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id: homeId, adminId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );

  try {
    const actor = requireSessionActor(session);
    undoAdministration(getDb(), actor, homeId, adminId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

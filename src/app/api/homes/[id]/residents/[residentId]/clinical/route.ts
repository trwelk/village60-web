import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { listResidentClinical } from "@/lib/residents/clinical";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string; residentId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { id: homeId, residentId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    const clinical = listResidentClinical(
      getDb(),
      requireSessionActor(session),
      homeId,
      residentId,
    );
    return NextResponse.json(clinical);
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

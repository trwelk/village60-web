import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { initializeMissingResidentOtherCharges } from "@/lib/billing/otherCharges";
import { homesErrorResponse } from "@/lib/homes/http";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = {
  params: Promise<{ id: string; residentId: string }>;
};

/**
 * Admin-only: backfill missing registration/deposit one-off lines with default
 * zero amounts (21d). Idempotent.
 */
export async function POST(_req: Request, { params }: RouteParams) {
  const { id: homeId, residentId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );

  try {
    const out = initializeMissingResidentOtherCharges(
      getDb(),
      requireSessionActor(session),
      homeId,
      residentId,
    );
    return NextResponse.json({
      otherCharges: out.otherCharges,
      createdTypes: out.createdTypes,
    });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

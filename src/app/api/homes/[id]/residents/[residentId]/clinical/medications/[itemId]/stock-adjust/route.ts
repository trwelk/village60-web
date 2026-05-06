import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { adjustResidentMedicationStock } from "@/lib/residents/clinical";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = {
  params: Promise<{ id: string; residentId: string; itemId: string }>;
};

export async function POST(req: Request, { params }: RouteParams) {
  const { id: homeId, residentId, itemId } = await params;
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
  if (rec.eventType !== "delivery" && rec.eventType !== "audit_correction") {
    return NextResponse.json(
      { error: "eventType must be delivery or audit_correction." },
      { status: 400 },
    );
  }
  if (typeof rec.amount !== "number" || Number.isNaN(rec.amount)) {
    return NextResponse.json(
      { error: "amount must be a number." },
      { status: 400 },
    );
  }
  try {
    const row = adjustResidentMedicationStock(
      getDb(),
      requireSessionActor(session),
      homeId,
      residentId,
      itemId,
      { eventType: rec.eventType, amount: rec.amount },
    );
    return NextResponse.json({ medication: row });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

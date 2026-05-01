import { getDb } from "@/db/client";
import { interestLeadsErrorResponse } from "@/lib/homeInterestLeads/http";
import { updateInterestLeadStatus } from "@/lib/homeInterestLeads/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: RouteParams) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const { id: leadId } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const rec =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const status = typeof rec.status === "string" ? rec.status : "";

  try {
    updateInterestLeadStatus(getDb(), session.role, leadId, status, Date.now());
    return NextResponse.json({ ok: true });
  } catch (e) {
    const resp = interestLeadsErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

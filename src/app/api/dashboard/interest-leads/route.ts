import { getDb } from "@/db/client";
import {
  createAdminInterestLead,
  listInterestLeadsForAdmin,
} from "@/lib/homeInterestLeads/service";
import { interestLeadsErrorResponse } from "@/lib/homeInterestLeads/http";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    const leads = listInterestLeadsForAdmin(getDb(), session.role);
    return NextResponse.json({ leads });
  } catch (e) {
    const resp = interestLeadsErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

export async function POST(req: Request) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  if (!session.userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
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
  const homeId = typeof rec.homeId === "string" ? rec.homeId : "";
  const contactName =
    typeof rec.contactName === "string" ? rec.contactName : "";
  const phone = typeof rec.phone === "string" ? rec.phone : "";
  const email =
    rec.email === undefined || rec.email === null
      ? null
      : typeof rec.email === "string"
        ? rec.email
        : null;
  const note =
    rec.note === undefined || rec.note === null
      ? null
      : typeof rec.note === "string"
        ? rec.note
        : null;

  try {
    const result = createAdminInterestLead(
      getDb(),
      session.role,
      session.userId,
      { homeId, contactName, phone, email, note },
      Date.now(),
    );
    if (result.outcome === "validation_error") {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }
    return NextResponse.json({ leadId: result.leadId });
  } catch (e) {
    const resp = interestLeadsErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

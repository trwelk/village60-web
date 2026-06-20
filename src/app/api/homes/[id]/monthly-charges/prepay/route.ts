import { getDb } from "@/db/client";
import { createPrepayInvoice } from "@/lib/billing/prepayMonths";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  const { id: homeId } = await params;
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
  if (typeof rec.residentId !== "string" || !rec.residentId.trim()) {
    return NextResponse.json({ error: "residentId is required." }, { status: 400 });
  }
  if (!Array.isArray(rec.months) || rec.months.length === 0) {
    return NextResponse.json(
      { error: "months must be a non-empty array of YYYY-MM strings." },
      { status: 400 },
    );
  }
  const months: string[] = [];
  for (const raw of rec.months) {
    if (typeof raw !== "string" || !raw.trim()) {
      return NextResponse.json(
        { error: "Each month must be a YYYY-MM string." },
        { status: 400 },
      );
    }
    months.push(raw.trim());
  }

  try {
    const result = createPrepayInvoice(getDb(), requireSessionActor(session), {
      homeId,
      residentId: rec.residentId.trim(),
      months,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

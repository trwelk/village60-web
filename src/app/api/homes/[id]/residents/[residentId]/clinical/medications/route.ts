import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { createResidentMedication } from "@/lib/residents/clinical";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string; residentId: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  const { id: homeId, residentId } = await params;
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
  for (const key of ["name", "dose", "frequency"] as const) {
    if (typeof rec[key] !== "string") {
      return NextResponse.json(
        { error: `${key} must be a string.` },
        { status: 400 },
      );
    }
  }
  let timingNotes: string | null | undefined;
  if ("timingNotes" in rec) {
    if (rec.timingNotes === null) {
      timingNotes = null;
    } else if (typeof rec.timingNotes === "string") {
      timingNotes = rec.timingNotes;
    } else {
      return NextResponse.json(
        { error: "timingNotes must be a string or null." },
        { status: 400 },
      );
    }
  }
  let prn: boolean | undefined;
  if ("prn" in rec) {
    if (typeof rec.prn !== "boolean") {
      return NextResponse.json(
        { error: "prn must be a boolean." },
        { status: 400 },
      );
    }
    prn = rec.prn;
  }
  try {
    const row = createResidentMedication(
      getDb(),
      requireSessionActor(session),
      homeId,
      residentId,
      {
        name: rec.name as string,
        dose: rec.dose as string,
        frequency: rec.frequency as string,
        timingNotes,
        prn,
      },
    );
    return NextResponse.json({ medication: row });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

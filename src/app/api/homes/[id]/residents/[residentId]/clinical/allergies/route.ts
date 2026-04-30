import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { createResidentAllergy } from "@/lib/residents/clinical";
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
  if (typeof rec.allergen !== "string") {
    return NextResponse.json(
      { error: "allergen must be a string." },
      { status: 400 },
    );
  }
  let notes: string | null | undefined;
  if ("notes" in rec) {
    if (rec.notes === null) {
      notes = null;
    } else if (typeof rec.notes === "string") {
      notes = rec.notes;
    } else {
      return NextResponse.json(
        { error: "notes must be a string or null." },
        { status: 400 },
      );
    }
  }
  try {
    const row = createResidentAllergy(
      getDb(),
      requireSessionActor(session),
      homeId,
      residentId,
      { allergen: rec.allergen, notes },
    );
    return NextResponse.json({ allergy: row });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

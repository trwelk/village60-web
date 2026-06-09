import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import {
  getMARForHome,
  recordAdministration,
  recordPRN,
} from "@/lib/mar/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function GET(req: Request, { params }: RouteParams) {
  const { id: homeId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");
  const date =
    dateParam && ISO_DATE_RE.test(dateParam) ? dateParam : todayIsoDate();
  if (dateParam && !ISO_DATE_RE.test(dateParam)) {
    return NextResponse.json(
      { error: "date must be YYYY-MM-DD." },
      { status: 400 },
    );
  }

  try {
    const actor = requireSessionActor(session);
    const mar = getMARForHome(getDb(), actor, homeId, date);
    return NextResponse.json({ mar });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

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

  const residentMedicationId =
    typeof rec.residentMedicationId === "string"
      ? rec.residentMedicationId.trim()
      : "";
  if (!residentMedicationId) {
    return NextResponse.json(
      { error: "residentMedicationId is required." },
      { status: 400 },
    );
  }

  const slot = typeof rec.slot === "string" ? rec.slot.trim() : "";
  if (!slot) {
    return NextResponse.json({ error: "slot is required." }, { status: 400 });
  }

  const dateRaw = typeof rec.date === "string" ? rec.date.trim() : "";
  const date =
    dateRaw && ISO_DATE_RE.test(dateRaw) ? dateRaw : todayIsoDate();
  if (dateRaw && !ISO_DATE_RE.test(dateRaw)) {
    return NextResponse.json(
      { error: "date must be YYYY-MM-DD." },
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
    const actor = requireSessionActor(session);
    const administration =
      slot === "prn"
        ? recordPRN(getDb(), actor, homeId, {
            residentMedicationId,
            date,
            notes,
          })
        : recordAdministration(getDb(), actor, homeId, {
            residentMedicationId,
            slot,
            date,
            notes,
          });
    return NextResponse.json({ administration });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

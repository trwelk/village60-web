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

  const itemId = typeof rec.itemId === "string" ? rec.itemId.trim() : "";
  if (!itemId) {
    return NextResponse.json(
      { error: "itemId is required." },
      { status: 400 },
    );
  }

  if (
    typeof rec.quantityPerServing !== "number" ||
    !Number.isFinite(rec.quantityPerServing)
  ) {
    return NextResponse.json(
      { error: "quantityPerServing must be a finite number." },
      { status: 400 },
    );
  }
  if (typeof rec.directions !== "string") {
    return NextResponse.json(
      { error: "directions must be a string." },
      { status: 400 },
    );
  }

  let servingsPerDay: number | null | undefined;
  if ("servingsPerDay" in rec) {
    if (rec.servingsPerDay === null) {
      servingsPerDay = null;
    } else if (
      typeof rec.servingsPerDay === "number" &&
      Number.isInteger(rec.servingsPerDay)
    ) {
      servingsPerDay = rec.servingsPerDay;
    } else {
      return NextResponse.json(
        { error: "servingsPerDay must be an integer or null." },
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
        itemId,
        quantityPerServing: rec.quantityPerServing,
        directions: rec.directions as string,
        servingsPerDay,
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

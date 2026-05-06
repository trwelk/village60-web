import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import {
  deleteResidentMedication,
  updateResidentMedication,
} from "@/lib/residents/clinical";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = {
  params: Promise<{ id: string; residentId: string; itemId: string }>;
};

export async function PATCH(req: Request, { params }: RouteParams) {
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
  const patch: {
      quantityPerServing?: number;
      directions?: string;
      servingsPerDay?: number | null;
      prn?: boolean;
      medicationId?: string;
  } = {};
  if ("quantityPerServing" in rec) {
    if (
      typeof rec.quantityPerServing !== "number" ||
      !Number.isFinite(rec.quantityPerServing)
    ) {
      return NextResponse.json(
        { error: "quantityPerServing must be a finite number." },
        { status: 400 },
      );
    }
    patch.quantityPerServing = rec.quantityPerServing;
  }
  if ("directions" in rec) {
    if (typeof rec.directions !== "string") {
      return NextResponse.json(
        { error: "directions must be a string." },
        { status: 400 },
      );
    }
    patch.directions = rec.directions;
  }
  if ("servingsPerDay" in rec) {
    if (rec.servingsPerDay === null) {
      patch.servingsPerDay = null;
    } else if (
      typeof rec.servingsPerDay === "number" &&
      Number.isInteger(rec.servingsPerDay)
    ) {
      patch.servingsPerDay = rec.servingsPerDay;
    } else {
      return NextResponse.json(
        { error: "servingsPerDay must be an integer or null." },
        { status: 400 },
      );
    }
  }
  if ("medicationId" in rec) {
    if (typeof rec.medicationId !== "string") {
      return NextResponse.json(
        { error: "medicationId must be a string." },
        { status: 400 },
      );
    }
    patch.medicationId = rec.medicationId;
  }
  if ("prn" in rec) {
    if (typeof rec.prn !== "boolean") {
      return NextResponse.json(
        { error: "prn must be a boolean." },
        { status: 400 },
      );
    }
    patch.prn = rec.prn;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }
  try {
    const row = updateResidentMedication(
      getDb(),
      requireSessionActor(session),
      homeId,
      residentId,
      itemId,
      patch,
    );
    return NextResponse.json({ medication: row });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id: homeId, residentId, itemId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    deleteResidentMedication(
      getDb(),
      requireSessionActor(session),
      homeId,
      residentId,
      itemId,
    );
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

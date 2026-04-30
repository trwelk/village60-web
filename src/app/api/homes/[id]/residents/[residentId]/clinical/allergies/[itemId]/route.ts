import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import {
  deleteResidentAllergy,
  updateResidentAllergy,
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
  const patch: { allergen?: string; notes?: string | null } = {};
  if ("allergen" in rec) {
    if (typeof rec.allergen !== "string") {
      return NextResponse.json(
        { error: "allergen must be a string." },
        { status: 400 },
      );
    }
    patch.allergen = rec.allergen;
  }
  if ("notes" in rec) {
    if (rec.notes === null) {
      patch.notes = null;
    } else if (typeof rec.notes === "string") {
      patch.notes = rec.notes;
    } else {
      return NextResponse.json(
        { error: "notes must be a string or null." },
        { status: 400 },
      );
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }
  try {
    const row = updateResidentAllergy(
      getDb(),
      requireSessionActor(session),
      homeId,
      residentId,
      itemId,
      patch,
    );
    return NextResponse.json({ allergy: row });
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
    deleteResidentAllergy(
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

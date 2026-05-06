import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import {
  deleteHomeMedicationCatalogRow,
  updateHomeMedicationCatalogRow,
} from "@/lib/homeMedications/catalog";
import { homesErrorResponse } from "@/lib/homes/http";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteCtx = {
  params: Promise<{ id: string; medicationId: string }>;
};

export async function PATCH(req: Request, ctx: RouteCtx) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const { id: homeId, medicationId } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const b =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  try {
    const actor = requireSessionActor(session);
    const patch: {
      name?: string;
      strength?: string;
      unit?: string;
    } = {};
    if ("name" in b && typeof b.name === "string") {
      patch.name = b.name;
    }
    if ("strength" in b && typeof b.strength === "string") {
      patch.strength = b.strength;
    }
    if ("unit" in b && typeof b.unit === "string") {
      patch.unit = b.unit;
    }
    if (
      patch.name === undefined &&
      patch.strength === undefined &&
      patch.unit === undefined
    ) {
      return NextResponse.json(
        { error: "Provide at least one of name, strength, or unit." },
        { status: 400 },
      );
    }
    const medication = updateHomeMedicationCatalogRow(
      getDb(),
      actor,
      homeId,
      medicationId,
      patch,
      Date.now(),
    );
    return NextResponse.json({ medication });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

export async function DELETE(_req: Request, ctx: RouteCtx) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const { id: homeId, medicationId } = await ctx.params;
  try {
    const actor = requireSessionActor(session);
    deleteHomeMedicationCatalogRow(getDb(), actor, homeId, medicationId);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

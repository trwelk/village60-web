import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import {
  createHomeMedicationCatalogRow,
  listHomeMedicationCatalog,
} from "@/lib/homeMedications/catalog";
import { homesErrorResponse } from "@/lib/homes/http";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: RouteCtx) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const { id: homeId } = await ctx.params;
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();

  try {
    const actor = requireSessionActor(session);
    const rows = listHomeMedicationCatalog(getDb(), actor, homeId, {
      ...(q !== undefined && q !== "" ? { q } : {}),
    });
    return NextResponse.json({ medications: rows });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

export async function POST(req: Request, ctx: RouteCtx) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const { id: homeId } = await ctx.params;
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
    const name = typeof b.name === "string" ? b.name : "";
    const strength = typeof b.strength === "string" ? b.strength : "";
    const unit = typeof b.unit === "string" ? b.unit : "";
    const medication = createHomeMedicationCatalogRow(
      getDb(),
      actor,
      homeId,
      { name, strength, unit },
      Date.now(),
    );
    return NextResponse.json({ medication }, { status: 201 });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { deleteHomeInventoryItem, updateHomeInventoryItem } from "@/lib/inventory/catalog";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string; itemId: string }> };

export async function PATCH(req: Request, { params }: RouteParams) {
  const { id: homeId, itemId } = await params;
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
  try {
    const actor = requireSessionActor(session);
    updateHomeInventoryItem(
      getDb(),
      actor,
      {
        homeId,
        itemId,
        categoryId: typeof rec.categoryId === "string" ? rec.categoryId : "",
        name: typeof rec.name === "string" ? rec.name : "",
        baseUnit: typeof rec.baseUnit === "string" ? rec.baseUnit : "",
        unitClass:
          rec.unitClass === "countable" || rec.unitClass === "measurable"
            ? rec.unitClass
            : "countable",
      },
      Date.now(),
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

export async function DELETE(_: Request, { params }: RouteParams) {
  const { id: homeId, itemId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    const actor = requireSessionActor(session);
    deleteHomeInventoryItem(getDb(), actor, { homeId, itemId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

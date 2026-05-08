import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { createHomeInventoryItem, listHomeInventoryItems } from "@/lib/inventory/catalog";
import { searchHomeInventoryItems } from "@/lib/inventory/purchaseOrders";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: RouteParams) {
  const { id: homeId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const url = new URL(req.url);
  const query = url.searchParams.get("query") ?? "";
  try {
    const actor = requireSessionActor(session);
    const items = query.trim()
      ? searchHomeInventoryItems(getDb(), actor, homeId, query)
      : listHomeInventoryItems(getDb(), actor, homeId);
    return NextResponse.json({ items });
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
  try {
    const actor = requireSessionActor(session);
    const item = createHomeInventoryItem(
      getDb(),
      actor,
      {
        homeId,
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
    return NextResponse.json({ item }, { status: 201 });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

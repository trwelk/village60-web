import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { logResidentMedicationPrnDispensed } from "@/lib/residents/clinical";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = {
  params: Promise<{ id: string; residentId: string; itemId: string }>;
};

export async function POST(req: Request, { params }: RouteParams) {
  const { id: homeId, residentId, itemId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  let body: unknown = {};
  try {
    const text = await req.text();
    if (text.trim()) {
      body = JSON.parse(text) as unknown;
    }
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  let quantity: number | undefined;
  if (typeof body === "object" && body !== null) {
    const rec = body as Record<string, unknown>;
    if ("quantity" in rec) {
      if (
        typeof rec.quantity !== "number" ||
        Number.isNaN(rec.quantity)
      ) {
        return NextResponse.json(
          { error: "quantity must be a number." },
          { status: 400 },
        );
      }
      quantity = rec.quantity;
    }
  } else if (body !== null && body !== undefined) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  try {
    const row = logResidentMedicationPrnDispensed(
      getDb(),
      requireSessionActor(session),
      homeId,
      residentId,
      itemId,
      quantity !== undefined ? { quantity } : undefined,
    );
    return NextResponse.json({ medication: row });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { createInventorySupplier, listInventorySuppliers } from "@/lib/inventory/catalog";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), getSessionOptions());
  try {
    const actor = requireSessionActor(session);
    const suppliers = listInventorySuppliers(getDb(), actor);
    return NextResponse.json({ suppliers });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

export async function POST(req: Request) {
  const session = await getIronSession<SessionData>(await cookies(), getSessionOptions());
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
    const supplier = createInventorySupplier(
      getDb(),
      actor,
      {
        name: typeof rec.name === "string" ? rec.name : "",
        address: typeof rec.address === "string" ? rec.address : undefined,
        phone: typeof rec.phone === "string" ? rec.phone : undefined,
        email: typeof rec.email === "string" ? rec.email : undefined,
      },
      Date.now(),
    );
    return NextResponse.json({ supplier }, { status: 201 });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

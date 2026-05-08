import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { deleteInventorySupplier, updateInventorySupplier } from "@/lib/inventory/catalog";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ supplierId: string }> };

export async function PATCH(req: Request, { params }: RouteParams) {
  const { supplierId } = await params;
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
    updateInventorySupplier(
      getDb(),
      actor,
      {
        supplierId,
        name: typeof rec.name === "string" ? rec.name : "",
        address: typeof rec.address === "string" ? rec.address : undefined,
        phone: typeof rec.phone === "string" ? rec.phone : undefined,
        email: typeof rec.email === "string" ? rec.email : undefined,
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
  const { supplierId } = await params;
  const session = await getIronSession<SessionData>(await cookies(), getSessionOptions());
  try {
    const actor = requireSessionActor(session);
    deleteInventorySupplier(getDb(), actor, { supplierId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

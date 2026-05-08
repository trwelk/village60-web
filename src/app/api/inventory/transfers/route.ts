import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { transferInventoryToResident } from "@/lib/inventory/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
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
  if (typeof body !== "object" || body == null) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const rec = body as Record<string, unknown>;
  const homeId = typeof rec.homeId === "string" ? rec.homeId : "";
  const residentId = typeof rec.residentId === "string" ? rec.residentId : "";
  const itemId = typeof rec.itemId === "string" ? rec.itemId : "";
  const quantityBaseUnits =
    typeof rec.quantityBaseUnits === "number"
      ? rec.quantityBaseUnits
      : Number(rec.quantityBaseUnits ?? 0);
  const sourceType = typeof rec.sourceType === "string" ? rec.sourceType : "TRANSFER_UI";
  const sourceId = typeof rec.sourceId === "string" ? rec.sourceId : "";
  const note = typeof rec.note === "string" ? rec.note : null;

  try {
    const actor = requireSessionActor(session);
    const transfer = transferInventoryToResident(
      getDb(),
      actor,
      { homeId, residentId, itemId, quantityBaseUnits, sourceType, sourceId, note },
      Date.now(),
    );
    return NextResponse.json({ transfer }, { status: 201 });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

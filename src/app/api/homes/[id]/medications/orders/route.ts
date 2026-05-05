import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import {
  createOrMergeLowStockMedicationOrderForResident,
  createOrMergeMedicationOrderForResident,
  listMedicationOrdersForHome,
  type MedicationOrderStatus,
} from "@/lib/medicationOrders/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteCtx = { params: Promise<{ id: string }> };

const STATUSES: MedicationOrderStatus[] = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
];

export async function GET(req: Request, ctx: RouteCtx) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const { id: homeId } = await ctx.params;
  const url = new URL(req.url);
  const residentIdRaw = url.searchParams.get("residentId")?.trim();
  const statusRaw = url.searchParams.get("status")?.trim();

  let status: MedicationOrderStatus | undefined;
  if (statusRaw && statusRaw.trim() !== "") {
    const s = statusRaw.trim() as MedicationOrderStatus;
    if (!STATUSES.includes(s)) {
      return NextResponse.json({ error: "Invalid status filter." }, { status: 400 });
    }
    status = s;
  }

  try {
    const actor = requireSessionActor(session);
    const orders = listMedicationOrdersForHome(getDb(), actor, homeId, {
      ...(status ? { status } : {}),
      ...(residentIdRaw ? { residentId: residentIdRaw } : {}),
    });
    return NextResponse.json({ orders });
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
  const residentId = typeof b.residentId === "string" ? b.residentId.trim() : "";
  if (!residentId) {
    return NextResponse.json({ error: "residentId is required." }, { status: 400 });
  }
  const lowStockOnly = typeof b.lowStockOnly === "boolean" ? b.lowStockOnly : false;

  try {
    const actor = requireSessionActor(session);
    const detail = lowStockOnly
      ? createOrMergeLowStockMedicationOrderForResident(getDb(), actor, homeId, residentId)
      : createOrMergeMedicationOrderForResident(getDb(), actor, homeId, residentId);
    return NextResponse.json(detail);
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

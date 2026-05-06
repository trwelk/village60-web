import { getDb } from "@/db/client";

import { requireSessionActor } from "@/lib/authz/sessionActor";

import { homesErrorResponse } from "@/lib/homes/http";

import { receiveMedicationOrderLine } from "@/lib/medicationOrders/service";

import { getSessionOptions, type SessionData } from "@/lib/session";

import { getIronSession } from "iron-session";

import { cookies } from "next/headers";

import { NextResponse } from "next/server";



type RouteCtx = { params: Promise<{ id: string; orderId: string; lineId: string }> };



export async function POST(req: Request, ctx: RouteCtx) {

  const session = await getIronSession<SessionData>(

    await cookies(),

    getSessionOptions(),

  );

  const { id: homeId, orderId, lineId } = await ctx.params;



  let body: unknown;

  try {

    body = await req.json();

  } catch {

    return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  }

  const b = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

  if (typeof b.amount !== "number" || !Number.isFinite(b.amount)) {

    return NextResponse.json({ error: "amount must be a finite number." }, { status: 400 });

  }

  const idempotencyKey =

    b.idempotencyKey === undefined || b.idempotencyKey === null

      ? undefined

      : String(b.idempotencyKey);



  try {

    const actor = requireSessionActor(session);

    const detail = receiveMedicationOrderLine(getDb(), actor, homeId, orderId, lineId, {

      amount: b.amount,

      idempotencyKey,

    });

    return NextResponse.json(detail);

  } catch (e) {

    const resp = homesErrorResponse(e);

    if (resp) return resp;

    throw e;

  }

}


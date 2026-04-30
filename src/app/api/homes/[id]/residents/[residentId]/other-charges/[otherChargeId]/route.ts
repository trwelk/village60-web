import { getDb } from "@/db/client";

import { updateResidentOtherCharge } from "@/lib/billing/otherCharges";

import { requireSessionActor } from "@/lib/authz/sessionActor";

import { homesErrorResponse } from "@/lib/homes/http";

import { getSessionOptions, type SessionData } from "@/lib/session";

import { getIronSession } from "iron-session";

import { cookies } from "next/headers";

import { NextResponse } from "next/server";

import type { OtherChargeUpdatePatch } from "@/lib/billing/otherCharges";



type RouteParams = {

  params: Promise<{ id: string; residentId: string; otherChargeId: string }>;

};



function parseBody(rec: Record<string, unknown>):

  | { ok: true; value: OtherChargeUpdatePatch }

  | { ok: false; error: string } {

  const out: OtherChargeUpdatePatch = {};

  if ("amountMinor" in rec) {

    if (typeof rec.amountMinor !== "number" || !Number.isInteger(rec.amountMinor)) {

      return { ok: false, error: "amountMinor must be an integer." };

    }

    out.amountMinor = rec.amountMinor;

  }

  if ("received" in rec) {

    if (typeof rec.received !== "boolean") {

      return { ok: false, error: "received must be a boolean." };

    }

    out.received = rec.received;

  }

  if ("paidOn" in rec) {

    out.hasPaidOnKey = true;

    if (rec.paidOn === null) {

      out.paidOn = null;

    } else if (typeof rec.paidOn === "string") {

      out.paidOn = rec.paidOn;

    } else {

      return { ok: false, error: "paidOn must be a string or null." };

    }

  }

  if (

    out.amountMinor === undefined &&

    out.received === undefined &&

    !out.hasPaidOnKey

  ) {

    return { ok: false, error: "No updates provided." };

  }

  return { ok: true, value: out };

}



export async function PATCH(req: Request, { params }: RouteParams) {

  const { id: homeId, residentId, otherChargeId } = await params;

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

  const parsed = parseBody(rec);

  if (!parsed.ok) {

    return NextResponse.json({ error: parsed.error }, { status: 400 });

  }



  try {

    const charge = updateResidentOtherCharge(

      getDb(),

      requireSessionActor(session),

      homeId,

      residentId,

      otherChargeId,

      parsed.value,

    );

    return NextResponse.json({ otherCharge: charge });

  } catch (e) {

    const resp = homesErrorResponse(e);

    if (resp) return resp;

    throw e;

  }

}


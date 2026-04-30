import { getDb } from "@/db/client";
import {
  createPaymentForCharge,
  deletePaymentForCharge,
  updatePaymentForCharge,
} from "@/lib/billing/residentCharges";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = {
  params: Promise<{ id: string; residentId: string; chargeId: string }>;
};

export async function POST(req: Request, { params }: RouteParams) {
  const { id: homeId, residentId, chargeId } = await params;
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
  if (typeof rec.amountMinor !== "number" || !Number.isInteger(rec.amountMinor)) {
    return NextResponse.json(
      { error: "amountMinor must be an integer." },
      { status: 400 },
    );
  }
  if (typeof rec.paidOn !== "string") {
    return NextResponse.json(
      { error: "paidOn must be a string." },
      { status: 400 },
    );
  }
  let notes: string | null | undefined;
  if ("notes" in rec) {
    if (rec.notes === null) {
      notes = null;
    } else if (typeof rec.notes === "string") {
      notes = rec.notes;
    } else {
      return NextResponse.json(
        { error: "notes must be a string or null." },
        { status: 400 },
      );
    }
  }

  try {
    const charge = createPaymentForCharge(
      getDb(),
      requireSessionActor(session),
      homeId,
      residentId,
      chargeId,
      {
        amountMinor: rec.amountMinor,
        paidOn: rec.paidOn,
        ...(notes !== undefined ? { notes } : {}),
      },
    );
    return NextResponse.json({ charge });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) {
      return resp;
    }
    throw e;
  }
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { id: homeId, residentId, chargeId } = await params;
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
  const patch: {
    amountMinor?: number;
    paidOn?: string;
    notes?: string | null;
  } = {};

  if ("amountMinor" in rec) {
    if (typeof rec.amountMinor !== "number" || !Number.isInteger(rec.amountMinor)) {
      return NextResponse.json(
        { error: "amountMinor must be an integer." },
        { status: 400 },
      );
    }
    patch.amountMinor = rec.amountMinor;
  }
  if ("paidOn" in rec) {
    if (typeof rec.paidOn !== "string") {
      return NextResponse.json(
        { error: "paidOn must be a string." },
        { status: 400 },
      );
    }
    patch.paidOn = rec.paidOn;
  }
  if ("notes" in rec) {
    if (rec.notes === null) {
      patch.notes = null;
    } else if (typeof rec.notes === "string") {
      patch.notes = rec.notes;
    } else {
      return NextResponse.json(
        { error: "notes must be a string or null." },
        { status: 400 },
      );
    }
  }

  if (
    patch.amountMinor === undefined &&
    patch.paidOn === undefined &&
    patch.notes === undefined
  ) {
    return NextResponse.json({ error: "No updates provided." }, { status: 400 });
  }

  try {
    const charge = updatePaymentForCharge(
      getDb(),
      requireSessionActor(session),
      homeId,
      residentId,
      chargeId,
      patch,
    );
    return NextResponse.json({ charge });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) {
      return resp;
    }
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id: homeId, residentId, chargeId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    const charge = deletePaymentForCharge(
      getDb(),
      requireSessionActor(session),
      homeId,
      residentId,
      chargeId,
    );
    return NextResponse.json({ charge });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) {
      return resp;
    }
    throw e;
  }
}

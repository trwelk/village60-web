import { getDb } from "@/db/client";
import { payInvoice, unpayInvoice } from "@/lib/billing/invoicePayments";
import { parseBillingPaymentReceivedOnUtcMs } from "@/lib/billing/receivedOnUtcMs";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string; invoiceId: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  const { id: homeId, invoiceId } = await params;
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
  if (typeof rec.method !== "string" || !rec.method.trim()) {
    return NextResponse.json({ error: "method is required." }, { status: 400 });
  }

  try {
    const paidOnUtcMs = parseBillingPaymentReceivedOnUtcMs(rec.paidOn);
    const result = payInvoice(getDb(), requireSessionActor(session), {
      homeId,
      invoiceId,
      paidOnUtcMs,
      method: rec.method.trim(),
      ...(typeof rec.externalReference === "string" || rec.externalReference === null
        ? { externalReference: rec.externalReference as string | null }
        : {}),
      ...(typeof rec.notes === "string" || rec.notes === null
        ? { notes: rec.notes as string | null }
        : {}),
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id: homeId, invoiceId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    const result = unpayInvoice(getDb(), requireSessionActor(session), {
      homeId,
      invoiceId,
    });
    return NextResponse.json(result);
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

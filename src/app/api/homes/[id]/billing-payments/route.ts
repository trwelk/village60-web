import { getDb } from "@/db/client";
import { parseBillingPaymentReceivedOnUtcMs } from "@/lib/billing/receivedOnUtcMs";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { recordPaymentForHome } from "@/lib/billing/paymentsLifecycle";
import { homesErrorResponse } from "@/lib/homes/http";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

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
  if (typeof rec.amountMinor !== "number") {
    return NextResponse.json(
      { error: "amountMinor must be a number." },
      { status: 400 },
    );
  }
  if (typeof rec.method !== "string") {
    return NextResponse.json({ error: "method must be a string." }, { status: 400 });
  }
  let postedAtUtcMs: number | undefined;
  if ("postedAtUtcMs" in rec && rec.postedAtUtcMs !== undefined) {
    if (typeof rec.postedAtUtcMs !== "number") {
      return NextResponse.json(
        { error: "postedAtUtcMs must be a number." },
        { status: 400 },
      );
    }
    postedAtUtcMs = rec.postedAtUtcMs;
  }

  try {
    const receivedOnUtcMs = parseBillingPaymentReceivedOnUtcMs(rec.receivedOn);
    const result = recordPaymentForHome(getDb(), requireSessionActor(session), {
      homeId,
      amountMinor: rec.amountMinor,
      receivedOnUtcMs,
      method: rec.method,
      ...(typeof rec.externalReference === "string" || rec.externalReference === null
        ? { externalReference: rec.externalReference as string | null }
        : {}),
      ...(typeof rec.notes === "string" || rec.notes === null
        ? { notes: rec.notes as string | null }
        : {}),
      postedAtUtcMs: postedAtUtcMs ?? receivedOnUtcMs,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

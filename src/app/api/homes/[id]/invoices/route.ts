import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { ensureHomeAccount } from "@/lib/billing/homeAccounts";
import { createDraftInvoice, listHomeInvoices } from "@/lib/billing/invoiceLifecycle";
import { homesErrorResponse } from "@/lib/homes/http";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

type DraftLineItemInput = {
  id?: string;
  category: string;
  description: string;
  amountMinor: number;
  serviceMonth?: string | null;
};

export async function GET(_req: Request, { params }: RouteParams) {
  const { id: homeId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    const invoices = listHomeInvoices(getDb(), requireSessionActor(session), homeId);
    return NextResponse.json({ invoices });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

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
  if (!Array.isArray(rec.lineItems)) {
    return NextResponse.json(
      { error: "lineItems must be an array." },
      { status: 400 },
    );
  }
  const lineItems: DraftLineItemInput[] = [];
  for (const raw of rec.lineItems) {
    if (typeof raw !== "object" || raw === null) {
      return NextResponse.json(
        { error: "lineItems must be an array of objects." },
        { status: 400 },
      );
    }
    const line = raw as Record<string, unknown>;
    if (
      typeof line.category !== "string" ||
      typeof line.description !== "string" ||
      typeof line.amountMinor !== "number"
    ) {
      return NextResponse.json(
        { error: "Each line item requires category, description, and amountMinor." },
        { status: 400 },
      );
    }
    lineItems.push({
      ...(typeof line.id === "string" ? { id: line.id } : {}),
      category: line.category,
      description: line.description,
      amountMinor: line.amountMinor,
      ...(typeof line.serviceMonth === "string" || line.serviceMonth === null
        ? { serviceMonth: line.serviceMonth as string | null }
        : {}),
    });
  }
  const billingAccountType =
    rec.billingAccountType === "home" ? ("home" as const) : ("resident" as const);
  let accountId: string;
  if (billingAccountType === "home") {
    accountId = ensureHomeAccount(getDb(), homeId).id;
  } else {
    if (typeof rec.accountId !== "string" || rec.accountId.trim() === "") {
      return NextResponse.json(
        { error: "accountId must be a non-empty string for resident invoices." },
        { status: 400 },
      );
    }
    accountId = rec.accountId.trim();
  }
  try {
    const { invoiceId } = createDraftInvoice(getDb(), requireSessionActor(session), {
      homeId,
      accountId,
      lineItems,
    });
    return NextResponse.json({ invoiceId }, { status: 201 });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

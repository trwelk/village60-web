import { getDb } from "@/db/client";
import {
  DEFAULT_CHARGES_LEDGER_PAGE_SIZE,
  getMonthlyChargesCollectionMeta,
  listHomeMonthlyChargesLedger,
  MAX_CHARGES_LEDGER_PAGE_SIZE,
  type HomeMonthlyChargesLedgerPaymentStatusFilter,
} from "@/lib/billing/residentCharges";
import {
  parseBillingMonth,
  utcYearToDateBillingMonthRange,
} from "@/lib/billing/billingMonth";
import { generateAndFinalizeMonthlyCharges } from "@/lib/billing/generateMonthlyCharges";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

function parsePositiveInt(raw: string | null, fallback: number): number {
  if (raw === null || raw === "") {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) {
    return fallback;
  }
  return n;
}

function parsePaymentStatus(
  raw: string | null,
): HomeMonthlyChargesLedgerPaymentStatusFilter {
  if (raw === "paid" || raw === "unpaid") {
    return raw;
  }
  return "all";
}

export async function GET(req: Request, { params }: RouteParams) {
  const { id: homeId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const url = new URL(req.url);
  const fromRaw = url.searchParams.get("billingMonthFrom");
  const toRaw = url.searchParams.get("billingMonthTo");
  try {
    const actor = requireSessionActor(session);
    let billingMonthFrom: string;
    let billingMonthTo: string;
    if (
      (fromRaw !== null && fromRaw !== "") ||
      (toRaw !== null && toRaw !== "")
    ) {
      if (!fromRaw?.trim() || !toRaw?.trim()) {
        return NextResponse.json(
          {
            error:
              "billingMonthFrom and billingMonthTo must both be set when either is provided.",
          },
          { status: 400 },
        );
      }
      billingMonthFrom = parseBillingMonth(fromRaw);
      billingMonthTo = parseBillingMonth(toRaw);
    } else {
      const ytd = utcYearToDateBillingMonthRange(Date.now());
      billingMonthFrom = ytd.billingMonthFrom;
      billingMonthTo = ytd.billingMonthTo;
    }
    const page = parsePositiveInt(url.searchParams.get("page"), 1);
    const pageSize = Math.min(
      MAX_CHARGES_LEDGER_PAGE_SIZE,
      Math.max(
        1,
        parsePositiveInt(
          url.searchParams.get("pageSize"),
          DEFAULT_CHARGES_LEDGER_PAGE_SIZE,
        ),
      ),
    );
    const paymentStatus = parsePaymentStatus(
      url.searchParams.get("paymentStatus"),
    );
    const residentIdRaw = url.searchParams.get("residentId");
    const residentId = residentIdRaw && residentIdRaw.trim() !== "" ? residentIdRaw.trim() : null;
    const db = getDb();
    const out = listHomeMonthlyChargesLedger(db, actor, homeId, {
      billingMonthFrom,
      billingMonthTo,
      residentId,
      paymentStatus,
      page,
      pageSize,
    });
    const collectionMeta =
      billingMonthFrom === billingMonthTo
        ? getMonthlyChargesCollectionMeta(db, actor, homeId, billingMonthFrom)
        : null;
    return NextResponse.json({
      charges: out.rows,
      totalCount: out.totalCount,
      page: out.page,
      pageSize: out.pageSize,
      summary: out.summary,
      billingMonthFrom,
      billingMonthTo,
      paymentStatus,
      residentId,
      ...(collectionMeta ?? {}),
    });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) {
      return resp;
    }
    throw e;
  }
}

/** Manual catch-up: open and finalize monthly invoices for this home. */
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
  const billingMonthRaw = (body as { billingMonth?: unknown }).billingMonth;
  if (typeof billingMonthRaw !== "string" || !billingMonthRaw.trim()) {
    return NextResponse.json(
      { error: "billingMonth is required (YYYY-MM)." },
      { status: 400 },
    );
  }

  try {
    const actor = requireSessionActor(session);
    const billingMonth = parseBillingMonth(billingMonthRaw.trim());
    const result = generateAndFinalizeMonthlyCharges(getDb(), {
      billingMonth,
      homeId,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) {
      return resp;
    }
    throw e;
  }
}

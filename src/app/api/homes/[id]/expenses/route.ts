import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import {
  clampHomeExpensePageSize,
  createHomeExpense,
  DEFAULT_HOME_EXPENSES_LEDGER_PAGE_SIZE,
  listHomeExpensesLedger,
  parsePaymentStatus,
  resolveHomeExpenseIncurredRange,
} from "@/lib/homeExpenses/service";
import { homeExpensesErrorResponse } from "@/lib/homeExpenses/http";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1) return fallback;
  return n;
}

/** Default `incurredOn` bounds use **UTC** calendar dates (aligned with billing date helpers). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const { id: homeId } = await ctx.params;
  const url = new URL(_req.url);
  try {
    const actor = requireSessionActor(session);
    const range = resolveHomeExpenseIncurredRange(
      url.searchParams.get("incurredFrom") ?? undefined,
      url.searchParams.get("incurredTo") ?? undefined,
      Date.now(),
    );
    const { paymentStatus, hadInvalid } = parsePaymentStatus(
      url.searchParams.get("paymentStatus"),
    );
    if (hadInvalid) {
      return NextResponse.json(
        { error: 'paymentStatus must be "all", "unpaid", or "paid".' },
        { status: 400 },
      );
    }
    const expenseTypeRaw = url.searchParams.get("expenseTypeId");
    const expenseTypeId = expenseTypeRaw?.trim()
      ? expenseTypeRaw.trim()
      : null;
    const page = parsePositiveInt(url.searchParams.get("page") ?? undefined, 1);
    const pageSize = clampHomeExpensePageSize(
      parsePositiveInt(
        url.searchParams.get("pageSize") ?? undefined,
        DEFAULT_HOME_EXPENSES_LEDGER_PAGE_SIZE,
      ),
    );

    const data = listHomeExpensesLedger(getDb(), actor, homeId, {
      incurredFrom: range.incurredFrom,
      incurredTo: range.incurredTo,
      paymentStatus,
      expenseTypeId,
      page,
      pageSize,
    });
    return NextResponse.json({
      ...data,
      incurredFrom: range.incurredFrom,
      incurredTo: range.incurredTo,
      paymentStatus,
      expenseTypeId,
    });
  } catch (e) {
    const resp = homeExpensesErrorResponse(e);
    if (resp !== null) return resp;
    throw e;
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
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
  try {
    const actor = requireSessionActor(session);
    const expenseTypeId =
      typeof b.expenseTypeId === "string" ? b.expenseTypeId : "";
    const incurredOn =
      typeof b.incurredOn === "string" ? b.incurredOn : "";
    const paidOn =
      b.paidOn === undefined
        ? undefined
        : typeof b.paidOn === "string"
          ? b.paidOn
          : b.paidOn === null
            ? null
            : undefined;
    const expense = createHomeExpense(
      getDb(),
      actor,
      homeId,
      {
        expenseTypeId,
        amountMinor:
          typeof b.amountMinor === "number" ? b.amountMinor : Number.NaN,
        incurredOn,
        ...(paidOn !== undefined ? { paidOn: paidOn as string | null } : {}),
        vendor: typeof b.vendor === "string" ? b.vendor : undefined,
        invoiceReference:
          typeof b.invoiceReference === "string"
            ? b.invoiceReference
            : undefined,
        note: typeof b.note === "string" ? b.note : undefined,
      },
      Date.now(),
    );
    return NextResponse.json({ expense }, { status: 201 });
  } catch (e) {
    const resp = homeExpensesErrorResponse(e);
    if (resp !== null) return resp;
    throw e;
  }
}

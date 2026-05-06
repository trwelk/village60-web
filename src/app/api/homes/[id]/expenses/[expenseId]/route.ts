import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homeExpensesErrorResponse } from "@/lib/homeExpenses/http";
import {
  deleteHomeExpense,
  getHomeExpenseLedgerRow,
  updateHomeExpense,
} from "@/lib/homeExpenses/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; expenseId: string }> },
) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const { id: homeId, expenseId } = await ctx.params;
  try {
    const actor = requireSessionActor(session);
    const expense = getHomeExpenseLedgerRow(
      getDb(),
      actor,
      homeId,
      expenseId,
    );
    return NextResponse.json({ expense });
  } catch (e) {
    const resp = homeExpensesErrorResponse(e);
    if (resp !== null) return resp;
    throw e;
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; expenseId: string }> },
) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const { id: homeId, expenseId } = await ctx.params;
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
    const patch: Parameters<typeof updateHomeExpense>[4] = {};
    if ("expenseTypeId" in b && typeof b.expenseTypeId === "string") {
      patch.expenseTypeId = b.expenseTypeId;
    }
    if ("amountMinor" in b && typeof b.amountMinor === "number") {
      patch.amountMinor = b.amountMinor;
    }
    if ("incurredOn" in b && typeof b.incurredOn === "string") {
      patch.incurredOn = b.incurredOn;
    }
    if ("paidOn" in b) {
      if (b.paidOn === null) {
        patch.paidOn = null;
      } else if (typeof b.paidOn === "string") {
        patch.paidOn = b.paidOn;
      }
    }
    if ("vendor" in b) {
      patch.vendor = typeof b.vendor === "string" ? b.vendor : null;
    }
    if ("invoiceReference" in b) {
      patch.invoiceReference =
        typeof b.invoiceReference === "string" ? b.invoiceReference : null;
    }
    if ("note" in b) {
      patch.note = typeof b.note === "string" ? b.note : null;
    }
    const expense = updateHomeExpense(
      getDb(),
      actor,
      homeId,
      expenseId,
      patch,
      Date.now(),
    );
    return NextResponse.json({ expense });
  } catch (e) {
    const resp = homeExpensesErrorResponse(e);
    if (resp !== null) return resp;
    throw e;
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; expenseId: string }> },
) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const { id: homeId, expenseId } = await ctx.params;
  try {
    const actor = requireSessionActor(session);
    deleteHomeExpense(getDb(), actor, homeId, expenseId);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const resp = homeExpensesErrorResponse(e);
    if (resp !== null) return resp;
    throw e;
  }
}

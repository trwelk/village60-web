import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { expenseTypesErrorResponse } from "@/lib/expenseTypes/http";
import { deleteExpenseType } from "@/lib/expenseTypes/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    const actor = requireSessionActor(session);
    deleteExpenseType(getDb(), actor, id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const resp = expenseTypesErrorResponse(e);
    if (resp !== null) return resp;
    throw e;
  }
}

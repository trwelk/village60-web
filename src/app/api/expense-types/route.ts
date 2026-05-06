import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { expenseTypesErrorResponse } from "@/lib/expenseTypes/http";
import { createExpenseType, listExpenseTypes } from "@/lib/expenseTypes/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    const actor = requireSessionActor(session);
    const expenseTypes = listExpenseTypes(getDb(), actor);
    return NextResponse.json({ expenseTypes });
  } catch (e) {
    const resp = expenseTypesErrorResponse(e);
    if (resp !== null) return resp;
    throw e;
  }
}

export async function POST(req: Request) {
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
  const name =
    typeof body === "object" &&
    body !== null &&
    "name" in body &&
    typeof (body as { name: unknown }).name === "string"
      ? (body as { name: string }).name
      : "";
  try {
    const actor = requireSessionActor(session);
    const expenseType = createExpenseType(getDb(), actor, { name }, Date.now());
    return NextResponse.json({ expenseType });
  } catch (e) {
    const resp = expenseTypesErrorResponse(e);
    if (resp !== null) return resp;
    throw e;
  }
}

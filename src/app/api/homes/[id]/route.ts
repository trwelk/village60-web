import { getDb } from "@/db/client";
import { homesErrorResponse } from "@/lib/homes/http";
import { updateHome } from "@/lib/homes/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: RouteParams) {
  const { id } = await params;
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
  const input: {
    name?: string;
    defaultCurrencyCode?: string;
    archived?: boolean;
  } = {};

  if ("name" in rec) {
    if (typeof rec.name !== "string") {
      return NextResponse.json({ error: "name must be a string." }, { status: 400 });
    }
    input.name = rec.name;
  }
  if ("defaultCurrencyCode" in rec) {
    if (typeof rec.defaultCurrencyCode !== "string") {
      return NextResponse.json(
        { error: "defaultCurrencyCode must be a string." },
        { status: 400 },
      );
    }
    input.defaultCurrencyCode = rec.defaultCurrencyCode;
  }
  if ("archived" in rec) {
    if (typeof rec.archived !== "boolean") {
      return NextResponse.json(
        { error: "archived must be a boolean." },
        { status: 400 },
      );
    }
    input.archived = rec.archived;
  }

  if (
    input.name === undefined &&
    input.defaultCurrencyCode === undefined &&
    input.archived === undefined
  ) {
    return NextResponse.json({ error: "No updates provided." }, { status: 400 });
  }

  try {
    const home = updateHome(getDb(), session.role, id, input);
    return NextResponse.json({ home });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

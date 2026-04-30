import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { deleteTask, updateTask } from "@/lib/tasks/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

function objectBody(body: unknown): Record<string, unknown> | null {
  return typeof body === "object" && body !== null
    ? (body as Record<string, unknown>)
    : null;
}

export async function PATCH(req: Request, { params }: RouteContext) {
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
  const rec = objectBody(body);
  if (!rec) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const input: {
    homeId?: string;
    title?: string;
    notes?: string | null;
    dueDate?: string | null;
    priority?: string;
    status?: string;
  } = {};
  if ("homeId" in rec) {
    if (typeof rec.homeId !== "string") {
      return NextResponse.json({ error: "homeId must be a string." }, { status: 400 });
    }
    input.homeId = rec.homeId;
  }
  if ("title" in rec) {
    if (typeof rec.title !== "string") {
      return NextResponse.json({ error: "title must be a string." }, { status: 400 });
    }
    input.title = rec.title;
  }
  if ("notes" in rec) {
    if (rec.notes !== null && typeof rec.notes !== "string") {
      return NextResponse.json(
        { error: "notes must be a string or null." },
        { status: 400 },
      );
    }
    input.notes = rec.notes;
  }
  if ("dueDate" in rec) {
    if (rec.dueDate !== null && typeof rec.dueDate !== "string") {
      return NextResponse.json(
        { error: "dueDate must be a string or null." },
        { status: 400 },
      );
    }
    input.dueDate = rec.dueDate;
  }
  if ("priority" in rec) {
    if (typeof rec.priority !== "string") {
      return NextResponse.json(
        { error: "priority must be a string." },
        { status: 400 },
      );
    }
    input.priority = rec.priority;
  }
  if ("status" in rec) {
    if (typeof rec.status !== "string") {
      return NextResponse.json({ error: "status must be a string." }, { status: 400 });
    }
    input.status = rec.status;
  }

  if (Object.keys(input).length === 0) {
    return NextResponse.json({ error: "No updates provided." }, { status: 400 });
  }

  try {
    const task = updateTask(getDb(), requireSessionActor(session), id, input);
    return NextResponse.json({ task });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    deleteTask(getDb(), requireSessionActor(session), id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

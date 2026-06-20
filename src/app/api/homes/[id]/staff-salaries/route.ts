import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { getSessionOptions, type SessionData } from "@/lib/session";
import {
  createStaffSalary,
  listStaffSalariesPaged,
  type CreateStaffSalaryInput,
} from "@/lib/salaries/service";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: RouteParams) {
  const { id: homeId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    const actor = requireSessionActor(session);
    const url = new URL(req.url);
    const query = url.searchParams.get("query") ?? undefined;
    const status = url.searchParams.get("status") as "active" | "inactive" | undefined;
    const page = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "20");

    const result = listStaffSalariesPaged(getDb(), actor, {
      homeId,
      query,
      status: status === "active" || status === "inactive" ? status : undefined,
      page,
      pageSize,
    });
    return NextResponse.json(result);
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
  try {
    const actor = requireSessionActor(session);
    const body = (await req.json()) as Omit<CreateStaffSalaryInput, "homeId">;
    const result = createStaffSalary(getDb(), actor, { ...body, homeId });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

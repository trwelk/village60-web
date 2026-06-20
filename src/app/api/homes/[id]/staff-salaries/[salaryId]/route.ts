import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { getSessionOptions, type SessionData } from "@/lib/session";
import {
  getStaffSalary,
  listRemittancesForStaffSalary,
  updateStaffSalary,
  type UpdateStaffSalaryInput,
} from "@/lib/salaries/service";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string; salaryId: string }> };

export async function GET(req: Request, { params }: RouteParams) {
  const { id: homeId, salaryId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    const actor = requireSessionActor(session);
    const result = getStaffSalary(getDb(), actor, homeId, salaryId);
    const url = new URL(req.url);
    if (url.searchParams.get("includeRemittances") === "true") {
      const remittances = listRemittancesForStaffSalary(
        getDb(),
        actor,
        homeId,
        salaryId,
      );
      return NextResponse.json({ ...result, remittances });
    }
    return NextResponse.json(result);
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { id: homeId, salaryId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    const actor = requireSessionActor(session);
    const body = (await req.json()) as UpdateStaffSalaryInput;
    const result = updateStaffSalary(getDb(), actor, homeId, salaryId, body);
    return NextResponse.json(result);
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

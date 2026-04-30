import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import {
  getResident,
  residentViewForActor,
  updateResident,
} from "@/lib/residents/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string; residentId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { id: homeId, residentId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  try {
    const actor = requireSessionActor(session);
    const resident = residentViewForActor(
      actor,
      getResident(getDb(), actor, homeId, residentId),
    );
    return NextResponse.json({ resident });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { id: homeId, residentId } = await params;
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
  if (
    "status" in rec ||
    "departureReason" in rec ||
    "departureAtUtcMs" in rec
  ) {
    return NextResponse.json(
      {
        error:
          "To mark a resident as departed, use POST on this resident’s /depart endpoint with a reason.",
      },
      { status: 400 },
    );
  }
  const patch: Parameters<typeof updateResident>[4] = {};

  if ("fullName" in rec) {
    if (typeof rec.fullName !== "string") {
      return NextResponse.json(
        { error: "fullName must be a string." },
        { status: 400 },
      );
    }
    patch.fullName = rec.fullName;
  }
  if ("dob" in rec) {
    if (typeof rec.dob !== "string") {
      return NextResponse.json({ error: "dob must be a string." }, { status: 400 });
    }
    patch.dob = rec.dob;
  }
  if ("admissionDate" in rec) {
    if (typeof rec.admissionDate !== "string") {
      return NextResponse.json(
        { error: "admissionDate must be a string." },
        { status: 400 },
      );
    }
    patch.admissionDate = rec.admissionDate;
  }
  if ("wardId" in rec) {
    if (rec.wardId === null) {
      patch.wardId = null;
    } else if (typeof rec.wardId === "string") {
      patch.wardId = rec.wardId;
    } else {
      return NextResponse.json(
        { error: "wardId must be a string or null." },
        { status: 400 },
      );
    }
  }
  if ("roomText" in rec) {
    if (rec.roomText === null) {
      patch.roomText = null;
    } else if (typeof rec.roomText === "string") {
      patch.roomText = rec.roomText;
    } else {
      return NextResponse.json(
        { error: "roomText must be a string or null." },
        { status: 400 },
      );
    }
  }
  if ("nokName" in rec) {
    if (rec.nokName === null) {
      patch.nokName = null;
    } else if (typeof rec.nokName === "string") {
      patch.nokName = rec.nokName;
    } else {
      return NextResponse.json(
        { error: "nokName must be a string or null." },
        { status: 400 },
      );
    }
  }
  if ("nokContact" in rec) {
    if (rec.nokContact === null) {
      patch.nokContact = null;
    } else if (typeof rec.nokContact === "string") {
      patch.nokContact = rec.nokContact;
    } else {
      return NextResponse.json(
        { error: "nokContact must be a string or null." },
        { status: 400 },
      );
    }
  }
  if ("nokRelationship" in rec) {
    if (rec.nokRelationship === null) {
      patch.nokRelationship = null;
    } else if (typeof rec.nokRelationship === "string") {
      patch.nokRelationship = rec.nokRelationship;
    } else {
      return NextResponse.json(
        { error: "nokRelationship must be a string or null." },
        { status: 400 },
      );
    }
  }
  if ("poaSameAsNok" in rec) {
    if (typeof rec.poaSameAsNok !== "boolean") {
      return NextResponse.json(
        { error: "poaSameAsNok must be a boolean." },
        { status: 400 },
      );
    }
    patch.poaSameAsNok = rec.poaSameAsNok;
  }
  if ("poaName" in rec) {
    if (rec.poaName === null) {
      patch.poaName = null;
    } else if (typeof rec.poaName === "string") {
      patch.poaName = rec.poaName;
    } else {
      return NextResponse.json(
        { error: "poaName must be a string or null." },
        { status: 400 },
      );
    }
  }
  if ("poaContact" in rec) {
    if (rec.poaContact === null) {
      patch.poaContact = null;
    } else if (typeof rec.poaContact === "string") {
      patch.poaContact = rec.poaContact;
    } else {
      return NextResponse.json(
        { error: "poaContact must be a string or null." },
        { status: 400 },
      );
    }
  }
  if ("poaRelationship" in rec) {
    if (rec.poaRelationship === null) {
      patch.poaRelationship = null;
    } else if (typeof rec.poaRelationship === "string") {
      patch.poaRelationship = rec.poaRelationship;
    } else {
      return NextResponse.json(
        { error: "poaRelationship must be a string or null." },
        { status: 400 },
      );
    }
  }
  if ("assignedNurseUserId" in rec) {
    if (rec.assignedNurseUserId === null) {
      patch.assignedNurseUserId = null;
    } else if (typeof rec.assignedNurseUserId === "string") {
      patch.assignedNurseUserId = rec.assignedNurseUserId;
    } else {
      return NextResponse.json(
        { error: "assignedNurseUserId must be a string or null." },
        { status: 400 },
      );
    }
  }
  if ("assignedNurseDisplayOverride" in rec) {
    if (rec.assignedNurseDisplayOverride === null) {
      patch.assignedNurseDisplayOverride = null;
    } else if (typeof rec.assignedNurseDisplayOverride === "string") {
      patch.assignedNurseDisplayOverride = rec.assignedNurseDisplayOverride;
    } else {
      return NextResponse.json(
        {
          error: "assignedNurseDisplayOverride must be a string or null.",
        },
        { status: 400 },
      );
    }
  }
  try {
    const actor = requireSessionActor(session);
    const resident = residentViewForActor(
      actor,
      updateResident(getDb(), actor, homeId, residentId, patch),
    );
    return NextResponse.json({ resident });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

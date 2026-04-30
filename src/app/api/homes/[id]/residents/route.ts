import { getDb } from "@/db/client";
import { parseCreateIntakeLine } from "@/lib/billing/otherChargeIntake";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import {
  createResident,
  DEFAULT_RESIDENTS_DIRECTORY_PAGE_SIZE,
  listResidentsPaged,
  MAX_RESIDENTS_DIRECTORY_PAGE_SIZE,
  residentViewForActor,
} from "@/lib/residents/service";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

function parseStatus(
  raw: string | null,
): "active" | "departed" | "all" | undefined {
  if (raw === null || raw === "") {
    return undefined;
  }
  if (raw === "active" || raw === "departed" || raw === "all") {
    return raw;
  }
  return undefined;
}

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

export async function GET(req: Request, { params }: RouteParams) {
  const { id: homeId } = await params;
  const session = await getIronSession<SessionData>(
    await cookies(),
    getSessionOptions(),
  );
  const url = new URL(req.url);
  const query = url.searchParams.get("query") ?? undefined;
  const statusParam = url.searchParams.get("status");
  const status = parseStatus(statusParam);
  if (statusParam !== null && statusParam !== "" && status === undefined) {
    return NextResponse.json(
      { error: "status must be active, departed, or all." },
      { status: 400 },
    );
  }
  const wardId = url.searchParams.get("wardId") ?? undefined;
  const page = parsePositiveInt(url.searchParams.get("page"), 1);
  const pageSize = Math.min(
    MAX_RESIDENTS_DIRECTORY_PAGE_SIZE,
    Math.max(
      1,
      parsePositiveInt(
        url.searchParams.get("pageSize"),
        DEFAULT_RESIDENTS_DIRECTORY_PAGE_SIZE,
      ),
    ),
  );

  try {
    const actor = requireSessionActor(session);
    const out = listResidentsPaged(getDb(), actor, {
      homeId,
      ...(query !== undefined ? { query } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(wardId !== undefined ? { wardId } : {}),
    }, { page, pageSize });
    const residents = out.residents.map((r) => residentViewForActor(actor, r));
    return NextResponse.json({
      residents,
      totalCount: out.totalCount,
      page: out.page,
      pageSize: out.pageSize,
    });
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
  const fullName =
    "fullName" in rec && typeof rec.fullName === "string" ? rec.fullName : "";
  const dob = "dob" in rec && typeof rec.dob === "string" ? rec.dob : "";
  const admissionDate =
    "admissionDate" in rec && typeof rec.admissionDate === "string"
      ? rec.admissionDate
      : "";
  if (!fullName.trim() || !dob || !admissionDate) {
    return NextResponse.json(
      { error: "fullName, dob, and admissionDate are required." },
      { status: 400 },
    );
  }

  if (!("otherCharges" in rec)) {
    return NextResponse.json(
      { error: "otherCharges with registration and deposit is required." },
      { status: 400 },
    );
  }
  const ocRaw = rec.otherCharges;
  if (typeof ocRaw !== "object" || ocRaw === null) {
    return NextResponse.json(
      { error: "otherCharges must be an object." },
      { status: 400 },
    );
  }
  const ocRec = ocRaw as Record<string, unknown>;
  if (!("registration" in ocRec) || !("deposit" in ocRec)) {
    return NextResponse.json(
      { error: "otherCharges.registration and otherCharges.deposit are required." },
      { status: 400 },
    );
  }

  let otherChargesIntake;
  try {
    otherChargesIntake = {
      registration: parseCreateIntakeLine(
        "registration",
        ocRec.registration,
        admissionDate,
      ),
      deposit: parseCreateIntakeLine("deposit", ocRec.deposit, admissionDate),
    };
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
  let wardId: string | null | undefined;
  if ("wardId" in rec) {
    if (rec.wardId === null) {
      wardId = null;
    } else if (typeof rec.wardId === "string") {
      wardId = rec.wardId;
    } else {
      return NextResponse.json(
        { error: "wardId must be a string or null." },
        { status: 400 },
      );
    }
  }
  let roomText: string | null | undefined;
  if ("roomText" in rec) {
    if (rec.roomText === null) {
      roomText = null;
    } else if (typeof rec.roomText === "string") {
      roomText = rec.roomText;
    } else {
      return NextResponse.json(
        { error: "roomText must be a string or null." },
        { status: 400 },
      );
    }
  }
  let nokName: string | null | undefined;
  if ("nokName" in rec) {
    if (rec.nokName === null) {
      nokName = null;
    } else if (typeof rec.nokName === "string") {
      nokName = rec.nokName;
    } else {
      return NextResponse.json(
        { error: "nokName must be a string or null." },
        { status: 400 },
      );
    }
  }
  let nokContact: string | null | undefined;
  if ("nokContact" in rec) {
    if (rec.nokContact === null) {
      nokContact = null;
    } else if (typeof rec.nokContact === "string") {
      nokContact = rec.nokContact;
    } else {
      return NextResponse.json(
        { error: "nokContact must be a string or null." },
        { status: 400 },
      );
    }
  }
  let nokRelationship: string | null | undefined;
  if ("nokRelationship" in rec) {
    if (rec.nokRelationship === null) {
      nokRelationship = null;
    } else if (typeof rec.nokRelationship === "string") {
      nokRelationship = rec.nokRelationship;
    } else {
      return NextResponse.json(
        { error: "nokRelationship must be a string or null." },
        { status: 400 },
      );
    }
  }
  let poaSameAsNok: boolean | undefined;
  if ("poaSameAsNok" in rec) {
    if (typeof rec.poaSameAsNok === "boolean") {
      poaSameAsNok = rec.poaSameAsNok;
    } else {
      return NextResponse.json(
        { error: "poaSameAsNok must be a boolean." },
        { status: 400 },
      );
    }
  }
  let poaName: string | null | undefined;
  if ("poaName" in rec) {
    if (rec.poaName === null) {
      poaName = null;
    } else if (typeof rec.poaName === "string") {
      poaName = rec.poaName;
    } else {
      return NextResponse.json(
        { error: "poaName must be a string or null." },
        { status: 400 },
      );
    }
  }
  let poaContact: string | null | undefined;
  if ("poaContact" in rec) {
    if (rec.poaContact === null) {
      poaContact = null;
    } else if (typeof rec.poaContact === "string") {
      poaContact = rec.poaContact;
    } else {
      return NextResponse.json(
        { error: "poaContact must be a string or null." },
        { status: 400 },
      );
    }
  }
  let poaRelationship: string | null | undefined;
  if ("poaRelationship" in rec) {
    if (rec.poaRelationship === null) {
      poaRelationship = null;
    } else if (typeof rec.poaRelationship === "string") {
      poaRelationship = rec.poaRelationship;
    } else {
      return NextResponse.json(
        { error: "poaRelationship must be a string or null." },
        { status: 400 },
      );
    }
  }
  let assignedNurseUserId: string | null | undefined;
  if ("assignedNurseUserId" in rec) {
    if (rec.assignedNurseUserId === null) {
      assignedNurseUserId = null;
    } else if (typeof rec.assignedNurseUserId === "string") {
      assignedNurseUserId = rec.assignedNurseUserId;
    } else {
      return NextResponse.json(
        { error: "assignedNurseUserId must be a string or null." },
        { status: 400 },
      );
    }
  }
  let assignedNurseDisplayOverride: string | null | undefined;
  if ("assignedNurseDisplayOverride" in rec) {
    if (rec.assignedNurseDisplayOverride === null) {
      assignedNurseDisplayOverride = null;
    } else if (typeof rec.assignedNurseDisplayOverride === "string") {
      assignedNurseDisplayOverride = rec.assignedNurseDisplayOverride;
    } else {
      return NextResponse.json(
        { error: "assignedNurseDisplayOverride must be a string or null." },
        { status: 400 },
      );
    }
  }

  if (
    wardId === undefined ||
    wardId === null ||
    (typeof wardId === "string" && wardId.trim() === "")
  ) {
    return NextResponse.json({ error: "wardId is required." }, { status: 400 });
  }
  if (
    nokName === undefined ||
    nokName === null ||
    typeof nokName !== "string" ||
    !nokName.trim() ||
    nokContact === undefined ||
    nokContact === null ||
    typeof nokContact !== "string" ||
    !nokContact.trim() ||
    nokRelationship === undefined ||
    nokRelationship === null ||
    typeof nokRelationship !== "string" ||
    !nokRelationship.trim()
  ) {
    return NextResponse.json(
      {
        error:
          "nokName, nokContact, and nokRelationship are required non-empty strings.",
      },
      { status: 400 },
    );
  }

  try {
    const actor = requireSessionActor(session);
    const resident = residentViewForActor(
      actor,
      createResident(getDb(), actor, {
        homeId,
        fullName,
        dob,
        admissionDate,
        otherChargesIntake,
        ...(wardId !== undefined ? { wardId } : {}),
        ...(roomText !== undefined ? { roomText } : {}),
        ...(nokName !== undefined ? { nokName } : {}),
        ...(nokContact !== undefined ? { nokContact } : {}),
        ...(nokRelationship !== undefined ? { nokRelationship } : {}),
        ...(poaSameAsNok !== undefined ? { poaSameAsNok } : {}),
        ...(poaName !== undefined ? { poaName } : {}),
        ...(poaContact !== undefined ? { poaContact } : {}),
        ...(poaRelationship !== undefined ? { poaRelationship } : {}),
        ...(assignedNurseUserId !== undefined ? { assignedNurseUserId } : {}),
        ...(assignedNurseDisplayOverride !== undefined
          ? { assignedNurseDisplayOverride }
          : {}),
      }),
    );
    return NextResponse.json({ resident });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

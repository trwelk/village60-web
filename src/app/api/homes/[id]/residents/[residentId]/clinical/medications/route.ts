import { getDb } from "@/db/client";
import { requireSessionActor } from "@/lib/authz/sessionActor";
import { homesErrorResponse } from "@/lib/homes/http";
import { createResidentMedication } from "@/lib/residents/clinical";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string; residentId: string }> };

export async function POST(req: Request, { params }: RouteParams) {
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

  const catalogId =
    typeof rec.medicationId === "string" ? rec.medicationId.trim() : "";
  const hasRef = catalogId.length > 0;

  const medRaw = rec.medication;
  const hasNestedObj =
    medRaw !== undefined &&
    medRaw !== null &&
    typeof medRaw === "object" &&
    !Array.isArray(medRaw);

  const hasLegacyTriple =
    typeof rec.name === "string" &&
    typeof rec.strength === "string" &&
    typeof rec.unit === "string";

  if (hasRef && (hasNestedObj || hasLegacyTriple)) {
    return NextResponse.json(
      { error: "Provide medicationId or medication, not both." },
      { status: 400 },
    );
  }

  if (!hasRef && !hasNestedObj && !hasLegacyTriple) {
    return NextResponse.json(
      {
        error:
          "Provide medicationId, or medication: { name, strength, unit }, or legacy name, strength, and unit.",
      },
      { status: 400 },
    );
  }

  let medication: { name: string; strength: string; unit: string } | undefined;
  if (hasNestedObj) {
    const mo = medRaw as Record<string, unknown>;
    for (const key of ["name", "strength", "unit"] as const) {
      if (typeof mo[key] !== "string") {
        return NextResponse.json(
          { error: `medication.${key} must be a string.` },
          { status: 400 },
        );
      }
    }
    medication = {
      name: mo.name as string,
      strength: mo.strength as string,
      unit: mo.unit as string,
    };
  } else if (!hasRef && hasLegacyTriple) {
    medication = {
      name: rec.name as string,
      strength: rec.strength as string,
      unit: rec.unit as string,
    };
  }

  if (
    typeof rec.quantityPerServing !== "number" ||
    !Number.isFinite(rec.quantityPerServing)
  ) {
    return NextResponse.json(
      { error: "quantityPerServing must be a finite number." },
      { status: 400 },
    );
  }
  if (typeof rec.directions !== "string") {
    return NextResponse.json(
      { error: "directions must be a string." },
      { status: 400 },
    );
  }

  let servingsPerDay: number | null | undefined;
  if ("servingsPerDay" in rec) {
    if (rec.servingsPerDay === null) {
      servingsPerDay = null;
    } else if (
      typeof rec.servingsPerDay === "number" &&
      Number.isInteger(rec.servingsPerDay)
    ) {
      servingsPerDay = rec.servingsPerDay;
    } else {
      return NextResponse.json(
        { error: "servingsPerDay must be an integer or null." },
        { status: 400 },
      );
    }
  }
  let prn: boolean | undefined;
  if ("prn" in rec) {
    if (typeof rec.prn !== "boolean") {
      return NextResponse.json(
        { error: "prn must be a boolean." },
        { status: 400 },
      );
    }
    prn = rec.prn;
  }

  try {
    const row = hasRef
      ? createResidentMedication(
          getDb(),
          requireSessionActor(session),
          homeId,
          residentId,
          {
            medicationId: catalogId,
            quantityPerServing: rec.quantityPerServing,
            directions: rec.directions as string,
            servingsPerDay,
            prn,
          },
        )
      : createResidentMedication(
          getDb(),
          requireSessionActor(session),
          homeId,
          residentId,
          {
            medication: medication!,
            quantityPerServing: rec.quantityPerServing,
            directions: rec.directions as string,
            servingsPerDay,
            prn,
          },
        );
    return NextResponse.json({ medication: row });
  } catch (e) {
    const resp = homesErrorResponse(e);
    if (resp) return resp;
    throw e;
  }
}

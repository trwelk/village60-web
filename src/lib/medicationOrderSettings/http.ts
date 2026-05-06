import { NextResponse } from "next/server";
import { ForbiddenError, ValidationError } from "@/lib/homes/errors";

export function medicationOrderSettingsErrorResponse(e: unknown): Response | null {
  if (e instanceof ForbiddenError) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }
  if (e instanceof ValidationError) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  return null;
}

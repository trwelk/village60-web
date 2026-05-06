import { NextResponse } from "next/server";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/homes/errors";

export function expenseTypesErrorResponse(e: unknown): Response | null {
  if (e instanceof ForbiddenError) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }
  if (e instanceof NotFoundError) {
    return NextResponse.json({ error: e.message }, { status: 404 });
  }
  if (e instanceof ValidationError) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  return null;
}

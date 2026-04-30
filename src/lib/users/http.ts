import { NextResponse } from "next/server";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/homes/errors";

export function usersErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof ValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  return null;
}

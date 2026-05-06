import { NextResponse } from "next/server";
import {
  BillingBatchError,
  ConflictError,
  DuplicateResidentError,
  ForbiddenError,
  NotFoundError,
  ResidentDepartConflictError,
  ValidationError,
} from "./errors";

export function homesErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof ValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof BillingBatchError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        ...(error.month != null ? { month: error.month } : {}),
      },
      { status: 400 },
    );
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof ConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof DuplicateResidentError) {
    return NextResponse.json(
      {
        error: error.message,
        existingResidentId: error.existingResidentId,
      },
      { status: 409 },
    );
  }
  if (error instanceof ResidentDepartConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  return null;
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Another resident already matches home + DOB + normalized full name (issue 06). */
export class DuplicateResidentError extends Error {
  readonly existingResidentId: string;

  constructor(existingResidentId: string) {
    super(
      "A resident with the same home, date of birth, and name already exists.",
    );
    this.name = "DuplicateResidentError";
    this.existingResidentId = existingResidentId;
  }
}

/** Active resident already has departure details or status is already departed (issue 13b). */
export class ResidentDepartConflictError extends Error {
  constructor(message = "This resident has already departed.") {
    super(message);
    this.name = "ResidentDepartConflictError";
  }
}

/** Bulk pay-by-month (issue 19a): validation with HTTP-friendly `code` and optional `month`. */
export class BillingBatchError extends Error {
  readonly code: string;
  readonly month?: string;

  constructor(message: string, code: string, month?: string) {
    super(message);
    this.name = "BillingBatchError";
    this.code = code;
    this.month = month;
  }
}

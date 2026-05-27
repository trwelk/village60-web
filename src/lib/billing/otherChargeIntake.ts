import { ValidationError } from "@/lib/homes/errors";

export type ResolvedIntakeLine = {
  amountMinor: number;
};

/** Parsed registration + deposit lines for atomic resident create (17c). */
export type CreateResidentOtherChargesIntake = {
  registration: ResolvedIntakeLine;
  deposit: ResolvedIntakeLine;
};

/**
 * Parse one registration/deposit line from the create-resident JSON body (17c).
 */
export function parseCreateIntakeLine(
  name: "registration" | "deposit",
  rec: unknown,
): ResolvedIntakeLine {
  const prefix = `otherCharges.${name}`;
  if (typeof rec !== "object" || rec === null) {
    throw new ValidationError(`${prefix} must be an object.`);
  }
  const o = rec as Record<string, unknown>;
  if (
    typeof o.amountMinor !== "number" ||
    !Number.isInteger(o.amountMinor) ||
    o.amountMinor < 0
  ) {
    throw new ValidationError(
      `${prefix}.amountMinor must be a non-negative integer.`,
    );
  }

  return { amountMinor: o.amountMinor };
}

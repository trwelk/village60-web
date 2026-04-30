import { ValidationError } from "@/lib/homes/errors";

/**
 * Phase 1 policy: long enough, mixed case, digit, and symbol (aligned with seeded admin style).
 */
export function validatePasswordPolicy(plain: string): void {
  if (plain.length < 12) {
    throw new ValidationError(
      "Password must be at least 12 characters long.",
    );
  }
  if (!/[a-z]/.test(plain)) {
    throw new ValidationError(
      "Password must include at least one lowercase letter.",
    );
  }
  if (!/[A-Z]/.test(plain)) {
    throw new ValidationError(
      "Password must include at least one uppercase letter.",
    );
  }
  if (!/[0-9]/.test(plain)) {
    throw new ValidationError("Password must include at least one digit.");
  }
  if (!/[^A-Za-z0-9]/.test(plain)) {
    throw new ValidationError(
      "Password must include at least one symbol (non-alphanumeric).",
    );
  }
}

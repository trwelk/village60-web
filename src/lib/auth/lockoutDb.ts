import type { LockoutState } from "@/lib/iam/lockout";
import { emptyLockoutState } from "@/lib/iam/lockout";

export function lockoutStateFromRow(
  failureJson: string | null,
  lockedUntilUtcMs: number | null,
): LockoutState {
  try {
    const parsed = failureJson ? (JSON.parse(failureJson) as unknown) : [];
    const failureTimestampsUtcMs = Array.isArray(parsed)
      ? parsed.filter((n): n is number => typeof n === "number")
      : [];
    return {
      failureTimestampsUtcMs,
      lockedUntilUtcMs: lockedUntilUtcMs ?? null,
    };
  } catch {
    return emptyLockoutState();
  }
}

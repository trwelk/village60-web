export type LockoutConfig = {
  maxFailuresPerWindow: number;
  failureWindowMs: number;
  lockoutMs: number;
};

/** Defaults match PRD guidance: five failures, fifteen-minute window and lockout. */
export const defaultLockoutConfig: LockoutConfig = {
  maxFailuresPerWindow: 5,
  failureWindowMs: 15 * 60 * 1000,
  lockoutMs: 15 * 60 * 1000,
};

export type LockoutState = {
  failureTimestampsUtcMs: number[];
  lockedUntilUtcMs: number | null;
};

export function emptyLockoutState(): LockoutState {
  return { failureTimestampsUtcMs: [], lockedUntilUtcMs: null };
}

export function isLoginAllowed(
  state: LockoutState,
  nowUtcMs: number,
): boolean {
  if (state.lockedUntilUtcMs != null && nowUtcMs < state.lockedUntilUtcMs) {
    return false;
  }
  return true;
}

export function applyFailedLoginAttempt(
  state: LockoutState,
  nowUtcMs: number,
  config: LockoutConfig,
): LockoutState {
  if (state.lockedUntilUtcMs != null && nowUtcMs < state.lockedUntilUtcMs) {
    return state;
  }

  const windowStart = nowUtcMs - config.failureWindowMs;
  const failuresInWindow = state.failureTimestampsUtcMs.filter(
    (t) => t > windowStart,
  );

  const nextFailures = [...failuresInWindow, nowUtcMs].filter(
    (t) => t > windowStart,
  );

  let lockedUntilUtcMs: number | null = null;
  if (nextFailures.length >= config.maxFailuresPerWindow) {
    lockedUntilUtcMs = nowUtcMs + config.lockoutMs;
  }

  return {
    failureTimestampsUtcMs: nextFailures,
    lockedUntilUtcMs: lockedUntilUtcMs,
  };
}

export function clearAfterSuccessfulLogin(): LockoutState {
  return emptyLockoutState();
}

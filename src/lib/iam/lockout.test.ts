import { describe, expect, it } from "vitest";
import {
  applyFailedLoginAttempt,
  clearAfterSuccessfulLogin,
  defaultLockoutConfig,
  emptyLockoutState,
  isLoginAllowed,
} from "./lockout";

const tightConfig = {
  maxFailuresPerWindow: 5,
  failureWindowMs: 15 * 60 * 1000,
  lockoutMs: 15 * 60 * 1000,
};

describe("login lockout", () => {
  it("allows login for a fresh account", () => {
    expect(isLoginAllowed(emptyLockoutState(), Date.now())).toBe(true);
  });

  it("locks after the configured number of failures inside the window", () => {
    const t0 = 1_700_000_000_000;
    let state = emptyLockoutState();
    for (let i = 0; i < 4; i++) {
      state = applyFailedLoginAttempt(state, t0 + i * 1000, tightConfig);
      expect(isLoginAllowed(state, t0 + i * 1000)).toBe(true);
    }
    state = applyFailedLoginAttempt(state, t0 + 4_000, tightConfig);
    expect(isLoginAllowed(state, t0 + 4_000)).toBe(false);
  });

  it("allows login again after the lockout duration elapses and failures age out", () => {
    const t0 = 2_000_000_000_000;
    let state = emptyLockoutState();
    for (let i = 0; i < 5; i++) {
      state = applyFailedLoginAttempt(state, t0 + i, tightConfig);
    }
    const lastFailure = t0 + 4;
    const afterLock = lastFailure + tightConfig.lockoutMs + 1;
    expect(isLoginAllowed(state, afterLock)).toBe(true);
    state = applyFailedLoginAttempt(state, afterLock, tightConfig);
    expect(isLoginAllowed(state, afterLock)).toBe(true);
  });

  it("resets counters after a successful login", () => {
    const t0 = 3_000_000_000_000;
    let state = emptyLockoutState();
    for (let i = 0; i < 4; i++) {
      state = applyFailedLoginAttempt(state, t0 + i, tightConfig);
    }
    state = clearAfterSuccessfulLogin();
    expect(state).toEqual(emptyLockoutState());
  });

  it("exposes defaults aligned with the PRD band", () => {
    expect(defaultLockoutConfig.maxFailuresPerWindow).toBe(5);
    expect(defaultLockoutConfig.failureWindowMs).toBe(15 * 60 * 1000);
    expect(defaultLockoutConfig.lockoutMs).toBe(15 * 60 * 1000);
  });
});

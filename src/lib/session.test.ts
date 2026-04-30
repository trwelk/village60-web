import { afterEach, describe, expect, it, vi } from "vitest";
import { getSessionOptions } from "./session";

describe("getSessionOptions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sets Secure on the session cookie in production (requires HTTPS)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_PASSWORD", "a".repeat(32));
    const opts = getSessionOptions();
    expect(opts.cookieOptions?.secure).toBe(true);
  });

  it("omits Secure on the session cookie in non-production for local HTTP", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SESSION_PASSWORD", "a".repeat(32));
    const opts = getSessionOptions();
    expect(opts.cookieOptions?.secure).toBe(false);
  });
});

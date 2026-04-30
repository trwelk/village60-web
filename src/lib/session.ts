import type { SessionOptions } from "iron-session";

export type SessionUserRole = "admin" | "care";

export type SessionData = {
  userId?: string;
  email?: string;
  role?: SessionUserRole;
};

/** Only used when ALLOW_INSECURE_SESSION_PASSWORD=1 (local smoke tests). */
const INSECURE_LOCAL_SESSION_PASSWORD =
  "village60-insecure-local-session-secret-min-32-chars";

function sessionPassword(): string {
  const password = process.env.SESSION_PASSWORD?.trim();
  if (password && password.length >= 32) {
    return password;
  }
  if (process.env.ALLOW_INSECURE_SESSION_PASSWORD === "1") {
    console.warn(
      "[village60] ALLOW_INSECURE_SESSION_PASSWORD is set; using a built-in local-only secret. Set SESSION_PASSWORD (see .env.example) for real deployments.",
    );
    return INSECURE_LOCAL_SESSION_PASSWORD;
  }
  throw new Error(
    "SESSION_PASSWORD must be set to at least 32 characters for iron-session. Copy .env.example to .env.local and set SESSION_PASSWORD, or for local-only `next start` smoke tests set ALLOW_INSECURE_SESSION_PASSWORD=1 (never in production).",
  );
}

/** ~30 minute session lifetime (PRD idle band). */
const IDLE_TTL_SECONDS = 30 * 60;

export function getSessionOptions(): SessionOptions {
  return {
    cookieName: "village60_session",
    password: sessionPassword(),
    ttl: IDLE_TTL_SECONDS,
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    },
  };
}

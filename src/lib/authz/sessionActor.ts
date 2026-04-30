import { ForbiddenError } from "@/lib/homes/errors";
import type { SessionData, SessionUserRole } from "@/lib/session";

/** Authenticated user with role, used for home-scoped authorization. */
export type SessionActor = {
  userId: string;
  role: SessionUserRole;
};

export function requireSessionActor(session: SessionData): SessionActor {
  if (!session.userId || !session.role) {
    throw new ForbiddenError();
  }
  return { userId: session.userId, role: session.role };
}

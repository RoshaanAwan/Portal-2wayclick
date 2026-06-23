import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { adminDb } from "./db";

// ── Single session read per request ───────────────────────────────────────────
// One source of truth for "the current request's session row + its user". Every
// auth/tenant concern (getCurrentUser, getImpersonation, currentRequestTenantId)
// derives from THIS, so an authenticated request hits the Session table exactly
// ONCE — instead of each helper issuing its own findUnique for the same token.
//
// Wrapped in React.cache so the lookup runs once and is shared across the whole
// RSC tree (layout + page + every helper) within a single request.
//
// adminDb: the token is the global credential and Session is a tenant-scoped
// model, so it can't be read through the scoped client before the tenant is
// known. Returns null for: no cookie, expired session, or a disabled account
// (treated as signed-out everywhere).

export const SESSION_COOKIE = "twayclick_session";

export const loadSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await adminDb.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) return null;
  // A disabled account is signed-out everywhere even if it still holds a
  // not-yet-revoked cookie (disabling also deletes sessions — belt + suspenders).
  if (session.user.disabledAt) return null;

  return session;
});

export type LoadedSession = NonNullable<Awaited<ReturnType<typeof loadSession>>>;

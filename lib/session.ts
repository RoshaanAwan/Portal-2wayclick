import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { adminDb } from "./db";
import { verifySessionJwt } from "./jwt";

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
  const cookieValue = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!cookieValue) return null;

  // The cookie carries a signed JWT wrapping the opaque session token. Verify it
  // and recover the embedded token; a bad signature / expired / tampered JWT
  // yields null claims → treated as signed-out. (Pre-JWT cookies that held the
  // raw token verify as null and are simply rejected — affected users re-login.)
  const claims = await verifySessionJwt(cookieValue);
  if (!claims) return null;

  const session = await adminDb.session.findUnique({
    where: { token: claims.sid },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) return null;
  // A disabled account is signed-out everywhere even if it still holds a
  // not-yet-revoked cookie (disabling also deletes sessions — belt + suspenders).
  if (session.user.disabledAt) return null;

  return session;
});

export type LoadedSession = NonNullable<Awaited<ReturnType<typeof loadSession>>>;

/**
 * The opaque session token for the CURRENT request, recovered from the signed
 * JWT cookie — i.e. the value stored in Session.token. Use when a route needs to
 * match/exclude THIS device's session row directly (session revocation, stop-
 * impersonation), rather than going through loadSession()'s full user lookup.
 * Returns null if there's no cookie or the JWT is invalid.
 */
export async function currentSessionToken(): Promise<string | null> {
  const cookieValue = (await cookies()).get(SESSION_COOKIE)?.value;
  const claims = await verifySessionJwt(cookieValue);
  return claims?.sid ?? null;
}

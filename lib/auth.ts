import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import bcrypt from "bcryptjs";
import { adminDb } from "./db";
import { enterTenant } from "./tenantContext";
import { tenantIdForSubdomain } from "./tenant";
import { randomBytes } from "crypto";

const SESSION_COOKIE = "twayclick_session";
const SESSION_DAYS = 7;
// Middleware forwards the resolved subdomain here so getCurrentUser can reject a
// session whose tenant doesn't match the host it arrived on.
const TENANT_SUBDOMAIN_HEADER = "x-tenant-subdomain";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(
  userId: string,
  tenantId: string,
  impersonatedBy?: string,
): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  // adminDb: Session is a scoped model, but a fresh session is minted before any
  // tenant context exists (login/QR-claim), so we set tenantId explicitly.
  await adminDb.session.create({
    data: { token, userId, tenantId, expiresAt, impersonatedBy },
  });

  // Next 15+: cookies() is async.
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Secure cookies are dropped by browsers over plain http. While the app is
    // served over http (no TLS/domain yet), set COOKIE_INSECURE=true to allow
    // the session cookie to be stored. Remove this env var once on HTTPS.
    secure:
      process.env.COOKIE_INSECURE === "true"
        ? false
        : process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });

  return token;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    // adminDb: token is the global credential; no tenant context guaranteed here.
    await adminDb.session.deleteMany({ where: { token } });
  }
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Returns the authenticated user (incl. tenantId / isPlatformAdmin) or null, and
 * — crucially — ESTABLISHES the tenant context for the rest of the request, so
 * every scoped query that follows is filtered to this user's tenant.
 *
 * Session lookup uses adminDb: the token is the global credential and Session is
 * a scoped model, so we can't query it through the scoped client before the
 * tenant is known. Once the session is found, enterTenant() makes the rest of
 * the request tenant-scoped.
 *
 * Cross-subdomain protection: if middleware resolved a subdomain for this request
 * and it maps to a DIFFERENT tenant than the session's, the session is treated as
 * signed-out (a token can't be replayed on another tenant's subdomain).
 *
 * Wrapped in React.cache() so the lookup + store entry happen once per request.
 */
export const getCurrentUser = cache(async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await adminDb.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  // A disabled account is treated as signed-out everywhere, even if it still
  // holds a (not-yet-revoked) session cookie. Disabling also deletes sessions,
  // so this is a belt-and-suspenders guard.
  if (session.user.disabledAt) {
    return null;
  }

  // Reject a session whose tenant doesn't match the host it arrived on. Platform
  // admins are exempt (they legitimately operate across subdomains / on bare
  // hosts during impersonation).
  if (!session.user.isPlatformAdmin) {
    const hdrs = await headers();
    const subdomain = hdrs.get(TENANT_SUBDOMAIN_HEADER);
    if (subdomain) {
      const hostTenantId = await tenantIdForSubdomain(subdomain);
      if (hostTenantId && hostTenantId !== session.tenantId) {
        return null;
      }
    }
  }

  // Establish the tenant context for every scoped query later in this request.
  enterTenant(session.tenantId);

  const { passwordHash, ...safeUser } = session.user;
  return safeUser;
});

export type SafeUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/**
 * Whether the current session is a platform-admin impersonation, and who started
 * it — drives the persistent "Impersonating" banner. Returns null normally.
 * adminDb: read by token before/independent of tenant scoping.
 */
export const getImpersonation = cache(async (): Promise<{
  byUserId: string;
} | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await adminDb.session.findUnique({
    where: { token },
    select: { impersonatedBy: true },
  });
  return session?.impersonatedBy ? { byUserId: session.impersonatedBy } : null;
});

/** Throws if not authenticated — use in route handlers / server actions. */
export async function requireUser(): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

/**
 * Throws unless the current user is a PLATFORM admin (operates above tenants).
 * Use to gate the cross-tenant management area and any adminDb/bypass usage.
 */
export async function requirePlatformAdmin(): Promise<SafeUser> {
  const user = await requireUser();
  if (!user.isPlatformAdmin) throw new Error("FORBIDDEN");
  return user;
}

import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import bcrypt from "bcryptjs";
import { adminDb } from "./db";
import { enterTenant } from "./tenantContext";
import { tenantIdForSubdomain } from "./tenant";
import { loadSession, SESSION_COOKIE } from "./session";
import { signSessionJwt, verifySessionJwt } from "./jwt";
import { randomBytes } from "crypto";

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

/**
 * Create a Session ROW and return its token — WITHOUT setting the cookie. Use
 * when the cookie must be set on a DIFFERENT host than the current request (the
 * cookie is host-scoped with no parent domain, by design). Impersonation needs
 * this: a System Owner on `system.<domain>` mints a session for a tenant, and the
 * cookie must land on the tenant's subdomain — so the token is claimed there.
 */
export async function mintSession(
  userId: string,
  tenantId: string,
  impersonatedBy?: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  // adminDb: Session is scoped, but the session is minted before any tenant
  // context exists; set tenantId explicitly.
  await adminDb.session.create({
    data: { token, userId, tenantId, expiresAt, impersonatedBy },
  });
  return { token, expiresAt };
}

/**
 * Set the session cookie (host-scoped) for an already-minted token. The cookie
 * VALUE is a signed JWT wrapping the opaque session token — the DB Session row
 * stays authoritative, but the cookie is now tamper-proof and self-expiring.
 * Needs the userId/tenantId for the JWT claims; the impersonate/QR claim routes
 * read these off the Session row before calling.
 */
export async function setSessionCookie(
  token: string,
  expiresAt: Date,
  claims: { userId: string; tenantId: string },
): Promise<void> {
  const jwt = await signSessionJwt(
    { sid: token, uid: claims.userId, tid: claims.tenantId },
    expiresAt,
  );
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, jwt, {
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
}

/** Mint a session AND set its cookie on the current host (normal login / QR). */
export async function createSession(
  userId: string,
  tenantId: string,
  impersonatedBy?: string,
): Promise<string> {
  const { token, expiresAt } = await mintSession(userId, tenantId, impersonatedBy);
  await setSessionCookie(token, expiresAt, { userId, tenantId });
  return token;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SESSION_COOKIE)?.value;
  if (cookieValue) {
    // The cookie holds a signed JWT wrapping the opaque session token; unwrap it
    // to get the token, then delete the DB row so the session is revoked even if
    // the cookie lingers. A malformed/forged JWT yields null and deletes nothing.
    const claims = await verifySessionJwt(cookieValue);
    if (claims) {
      // adminDb: token is the global credential; no tenant context guaranteed here.
      await adminDb.session.deleteMany({ where: { token: claims.sid } });
    }
  }
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Returns the authenticated user (incl. tenantId / isPlatformAdmin) or null, and
 * — crucially — ESTABLISHES the tenant context for the rest of the request, so
 * every scoped query that follows is filtered to this user's tenant.
 *
 * The underlying Session row is loaded once per request by loadSession()
 * (lib/session.ts) — a React.cache'd single read shared by every auth/tenant
 * helper — so this does NOT issue its own query. Once the session is found,
 * enterTenant() makes the rest of the request tenant-scoped.
 *
 * Cross-subdomain protection: if middleware resolved a subdomain for this request
 * and it maps to a DIFFERENT tenant than the session's, the session is treated as
 * signed-out (a token can't be replayed on another tenant's subdomain).
 *
 * Wrapped in React.cache() so the store entry happens once per request.
 */
export const getCurrentUser = cache(async () => {
  // Run the session DB lookup and the tenant subdomain lookup in parallel —
  // both need a DB round-trip and neither depends on the other's result.
  const hdrs = await headers();
  const subdomain = hdrs.get(TENANT_SUBDOMAIN_HEADER);

  const [session, hostTenantId] = await Promise.all([
    loadSession(),
    subdomain ? tenantIdForSubdomain(subdomain) : Promise.resolve(null),
  ]);

  if (!session) return null;

  // Reject a session whose tenant doesn't match the host it arrived on. System
  // Owners are exempt: they live on the reserved "system" tenant and browse the
  // platform area on the bare host.
  if (!session.user.isSystemOwner) {
    if (hostTenantId && hostTenantId !== session.tenantId) {
      return null;
    }
  }

  // Establish the tenant context for every scoped query later in this request.
  enterTenant(session.tenantId);

  const { passwordHash, ...safeUser } = session.user;
  return safeUser;
});

export type SafeUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/**
 * Whether the current session is a System Owner impersonation, and who started
 * it — drives the persistent "Impersonating" banner. Returns null normally.
 * Reads the shared once-per-request session row (no extra query).
 */
export const getImpersonation = cache(async (): Promise<{
  byUserId: string;
} | null> => {
  const session = await loadSession();
  return session?.impersonatedBy ? { byUserId: session.impersonatedBy } : null;
});

/** Throws if not authenticated — use in route handlers / server actions. */
export async function requireUser(): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

/**
 * Throws unless the current user is a SYSTEM OWNER (the platform operator above
 * all tenants). Use to gate the tenant-management area and any adminDb usage.
 */
export async function requireSystemOwner(): Promise<SafeUser> {
  const user = await requireUser();
  if (!user.isSystemOwner) throw new Error("FORBIDDEN");
  return user;
}

/**
 * Throws unless the current user is a TENANT user (not a System Owner). Confines
 * a System Owner OUT of all tenant business routes — they have no tenant
 * identity and may only act on tenant data via impersonation (which returns a
 * normal tenant user, so this passes during impersonation). Use at the top of
 * every tenant-data write route / server action.
 */
export async function requireTenantUser(): Promise<SafeUser> {
  const user = await requireUser();
  if (user.isSystemOwner) throw new Error("PLATFORM_ONLY");
  return user;
}

/** @deprecated renamed to requireSystemOwner. Kept transiently for imports. */
export const requirePlatformAdmin = requireSystemOwner;

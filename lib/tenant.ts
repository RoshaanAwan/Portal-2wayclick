import "server-only";
import { cache } from "react";
import { adminDb } from "./db";
import { loadSession } from "./session";

// ── Tenant resolution helpers ─────────────────────────────────────────────────
// Resolve a subdomain (from the request Host, forwarded by middleware) to a
// Tenant row. Uses adminDb because Tenant is a top-level platform table, not a
// tenant-scoped one, and this runs before any tenant context is established.
// React.cache dedupes the lookup within a single request.

export const DEFAULT_SUBDOMAIN = "default";

/** Subdomains that never map to a tenant (platform / login / reserved hosts). */
export const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "admin",
  "api",
  "localhost",
]);

export const getTenantBySubdomain = cache(async (subdomain: string) => {
  if (!subdomain || RESERVED_SUBDOMAINS.has(subdomain)) return null;
  try {
    return await adminDb.tenant.findUnique({ where: { subdomain } });
  } catch {
    return null;
  }
});

export const getTenantById = cache(async (id: string) => {
  try {
    return await adminDb.tenant.findUnique({ where: { id } });
  } catch {
    return null;
  }
});

/**
 * Dev-only convenience: when a request has NO tenant subdomain (e.g. plain
 * `localhost:3001`), fall back to a default tenant so you can sign in without
 * setting up `*.lvh.me` subdomains locally.
 *
 * HARD-GUARDED so it can never weaken production isolation:
 *   • disabled when NODE_ENV === "production"
 *   • opt-in only — does nothing unless DEV_DEFAULT_TENANT is set (to the
 *     subdomain of the tenant to fall back to, e.g. "default")
 * Returns that tenant's id when both hold and the tenant exists+active, else null.
 */
async function devFallbackTenantId(): Promise<string | null> {
  if (process.env.NODE_ENV === "production") return null;
  const sub = process.env.DEV_DEFAULT_TENANT;
  if (!sub) return null;
  const t = await getTenantBySubdomain(sub);
  if (!t || t.status === "suspended") return null;
  return t.id;
}

/** Subdomain → tenant id, or null if unknown/reserved/suspended. */
export async function tenantIdForSubdomain(
  subdomain: string | null | undefined,
): Promise<string | null> {
  if (!subdomain) return devFallbackTenantId();
  const t = await getTenantBySubdomain(subdomain);
  if (!t || t.status === "suspended") return devFallbackTenantId();
  return t.id;
}

/**
 * The current request's tenant id, resolved from the SESSION COOKIE (the user's
 * own tenant). React.cache'd so it runs once per request and — crucially — is
 * shared across the whole RSC tree (layout AND every page), which an
 * AsyncLocalStorage.enterWith side-effect is NOT. This is the fallback the scoped
 * Prisma client (lib/db.ts) uses when no explicit tenantStore context is active,
 * so every server component/route is tenant-scoped without each one having to
 * call runWithTenant. Returns null when there's no session (login/platform).
 *
 * Derives from loadSession() (lib/session.ts) — the single once-per-request
 * Session read shared with getCurrentUser/getImpersonation — so this issues no
 * query of its own.
 */
export const currentRequestTenantId = cache(async (): Promise<string | null> => {
  try {
    const session = await loadSession();
    return session?.tenantId ?? null;
  } catch {
    return null;
  }
});

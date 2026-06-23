import "server-only";
import { randomBytes } from "crypto";

// ── Client share links ─────────────────────────────────────────────────────
// Helpers for the public, login-less project link a client uses to view the
// board, comment on cards, and submit requests. The token is the only secret —
// it lives in the URL — so it must be long and unguessable, and the absolute
// URL must be built from a trusted base, never from request headers.

/**
 * A fresh, URL-safe share token: 24 random bytes (192 bits) as base64url.
 * Opaque and unguessable — anyone holding it can reach the public board, so
 * regenerating (issuing a new one + dropping the old) is how a link is revoked.
 */
export function newShareToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * The site's base URL (no trailing slash), built from a trusted source — NOT
 * the incoming Host header, which a caller can spoof.
 *
 * Multi-tenant: pass the current tenant's `subdomain` so the link lands on that
 * tenant's host. When a subdomain is given AND NEXT_PUBLIC_PORTAL_DOMAIN is set,
 * the URL is `${proto}://${subdomain}.${PORTAL_DOMAIN}` (http for a localhost
 * base, https otherwise). Without a subdomain (or domain), resolution order is:
 *   1. NEXT_PUBLIC_APP_URL / APP_URL — set this for a custom domain.
 *   2. VERCEL_PROJECT_PRODUCTION_URL — the stable prod domain Vercel injects
 *      automatically (host only, no scheme), so links are correct on Vercel
 *      with zero config.
 *   3. localhost — local dev fallback.
 */
/**
 * Whether a portal base domain is a LOCAL dev host (→ plain HTTP). Dev servers
 * always carry an explicit :port (localhost:3000, lvh.me:3001), and lvh.me /
 * localhost / 127.0.0.1 are local; everything else is a real domain over HTTPS.
 * Shared so the protocol choice can't drift between URL builders.
 */
export function isLocalPortalDomain(portalDomain: string): boolean {
  return (
    portalDomain.includes(":") ||
    /(^|\.)(localhost|lvh\.me)$/.test(portalDomain) ||
    portalDomain.startsWith("127.0.0.1")
  );
}

export function appBaseUrl(subdomain?: string | null): string {
  // Per-tenant host wins when we know both the subdomain and the base domain.
  const portalDomain = (process.env.NEXT_PUBLIC_PORTAL_DOMAIN ?? "").replace(
    /\/+$/,
    "",
  );
  if (subdomain && portalDomain) {
    const proto = isLocalPortalDomain(portalDomain) ? "http" : "https";
    return `${proto}://${subdomain}.${portalDomain}`;
  }

  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}

/**
 * Absolute URL a client opens for a given share token. Pass the current
 * tenant's subdomain so the link points at that tenant's host.
 */
export function shareUrl(token: string, subdomain?: string | null): string {
  return `${appBaseUrl(subdomain)}/shared/${token}`;
}

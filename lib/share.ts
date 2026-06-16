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
 * the incoming Host header, which a caller can spoof. Resolution order:
 *   1. NEXT_PUBLIC_APP_URL / APP_URL — set this for a custom domain.
 *   2. VERCEL_PROJECT_PRODUCTION_URL — the stable prod domain Vercel injects
 *      automatically (host only, no scheme), so links are correct on Vercel
 *      with zero config.
 *   3. localhost — local dev fallback.
 */
export function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}

/** Absolute URL a client opens for a given share token. */
export function shareUrl(token: string): string {
  return `${appBaseUrl()}/shared/${token}`;
}

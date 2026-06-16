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
 * Absolute URL a client opens. Built from APP_URL / NEXT_PUBLIC_APP_URL (set in
 * prod) and falling back to localhost in dev — NOT from the incoming Host
 * header, which a caller can spoof. No trailing slash on the base.
 */
export function shareUrl(token: string): string {
  const base = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
  return `${base}/shared/${token}`;
}

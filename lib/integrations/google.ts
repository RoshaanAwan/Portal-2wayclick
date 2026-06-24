import "server-only";

// ── Google OAuth 2.0 (web server flow) ────────────────────────────────────────
// The minimal OAuth helpers for "Connect your Google Drive". No googleapis SDK —
// just the documented token endpoints over fetch. We request offline access so
// Google returns a long-lived REFRESH token on first consent; that's what we
// store (encrypted) per user and exchange for short-lived access tokens on each
// API call.
//
// Requires env:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
//   GOOGLE_OAUTH_REDIRECT_URI  (e.g. https://app.example.com/api/integrations/google/callback)
// In dev the redirect URI defaults to http://<host>/api/integrations/google/callback,
// derived from the request, so localhost works without extra config.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

// drive.file = per-file access to files the app creates/opens — the least
// privilege that still lets us upload and list what the portal put there.
// Add openid/email so we can show which account is connected.
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "openid",
  "email",
].join(" ");

/** A tenant's (or the platform's) Google OAuth app credentials. */
export interface GoogleCreds {
  clientId: string;
  clientSecret: string;
}

/**
 * The request origin (scheme://host) Google's flow should use, normalized so it
 * is always a VALID, registrable redirect host:
 *   • `*.localhost` → `*.lvh.me`  (Google rejects `.localhost` redirect URIs;
 *     lvh.me is a real public domain that also resolves to 127.0.0.1 in dev)
 *   • bare `localhost` → `lvh.me`
 * This is the single source of truth used by BOTH the connect and callback
 * routes — they MUST agree, since the token exchange's redirect_uri has to match
 * the one sent to the consent screen exactly.
 */
export function originFromRequest(req: Request): string {
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const rawHost = req.headers.get("host") ?? url.host; // e.g. "roshaan.localhost:3000"
  const [hostname, port] = rawHost.split(":");

  let host = hostname;
  if (hostname === "localhost") {
    host = "lvh.me";
  } else if (hostname.endsWith(".localhost")) {
    host = hostname.slice(0, -".localhost".length) + ".lvh.me";
  }
  return `${proto}://${host}${port ? `:${port}` : ""}`;
}

/** The redirect URI Google calls back. Prefer the explicit env; else derive from
 *  the (normalized) request origin. NOTE: this is what each tenant's admin must
 *  whitelist in THEIR Google Cloud OAuth client. */
export function redirectUri(origin: string): string {
  return (
    process.env.GOOGLE_OAUTH_REDIRECT_URI ||
    `${origin}/api/integrations/google/callback`
  );
}

/** Build the consent URL. `state` is an opaque CSRF token we also set as a
 *  cookie and verify on callback. */
export function buildAuthUrl(
  creds: GoogleCreds,
  origin: string,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline", // → refresh token
    include_granted_scopes: "true",
    prompt: "consent", // force a refresh token even on re-consent
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token?: string;
}

/** Exchange an authorization code for tokens (incl. the refresh token). */
export async function exchangeCode(
  creds: GoogleCreds,
  code: string,
  origin: string,
): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: redirectUri(origin),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Google token exchange failed (${res.status}): ${detail}`);
  }
  return (await res.json()) as TokenResponse;
}

/** Mint a fresh access token from a stored refresh token. */
export async function refreshAccessToken(
  creds: GoogleCreds,
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Google token refresh failed (${res.status}): ${detail}`);
  }
  const data = (await res.json()) as TokenResponse;
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

/** Decode the email from an id_token (no signature verification needed — it came
 *  straight from Google's token endpoint over TLS). Best-effort. */
export function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = idToken.split(".")[1];
    const json = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    return typeof json.email === "string" ? json.email : null;
  } catch {
    return null;
  }
}

/** Best-effort revoke of a token (on disconnect). Never throws. */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  } catch {
    /* ignore */
  }
}

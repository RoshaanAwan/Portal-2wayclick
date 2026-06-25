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

// `drive` = full Drive access. We need this (not the narrower drive.file)
// because the owner pastes the URL of a PRE-EXISTING folder for the portal to
// create subfolders in and upload into — drive.file can only touch files the app
// itself created, so it can't write into a folder the user already had. This is a
// Google "sensitive/restricted" scope: production use requires app verification.
// Add openid/email so we can show which account is connected.
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "openid",
  "email",
].join(" ");

/**
 * Extract a Drive FOLDER id from anything the owner might paste:
 *   • https://drive.google.com/drive/folders/<ID>?... (the common "open folder" URL)
 *   • https://drive.google.com/drive/u/0/folders/<ID>
 *   • https://drive.google.com/open?id=<ID>
 *   • …?id=<ID> anywhere in the query
 *   • a bare folder id pasted on its own
 * Returns null if nothing folder-id-shaped is found. Validation that the id is a
 * real, writable folder happens against the Drive API (getFolder), not here.
 */
export function parseDriveFolderId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  // /folders/<ID>
  const folders = raw.match(/\/folders\/([A-Za-z0-9_-]+)/);
  if (folders) return folders[1];

  // ?id=<ID> / &id=<ID>
  const idParam = raw.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (idParam) return idParam[1];

  // A bare id (no slashes/spaces, Drive-id charset). Drive ids are typically
  // 25+ chars; keep a low floor but reject obvious non-ids.
  if (/^[A-Za-z0-9_-]{10,}$/.test(raw)) return raw;

  return null;
}

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
  const rawHost = req.headers.get("host") ?? url.host; // e.g. "roshaan.localhost:3000"
  const [hostname, port] = rawHost.split(":");

  const isLocal =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "lvh.me" ||
    hostname.endsWith(".lvh.me") ||
    hostname === "127.0.0.1";

  // Scheme: behind a TLS-terminating proxy the connection to Node is plain http
  // and `x-forwarded-proto` may be missing/wrong, so trusting it produced an
  // `http://…/callback` redirect_uri that mismatched the `https://` one
  // registered in Google Cloud (Error 400: redirect_uri_mismatch). A PUBLIC host
  // always runs OAuth over https — the registered redirect URI is https — so
  // force it. Only local dev (localhost/lvh.me/127.0.0.1) keeps http. An explicit
  // GOOGLE_OAUTH_REDIRECT_URI still overrides everything (see redirectUri()).
  const proto = isLocal
    ? req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")
    : "https";

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

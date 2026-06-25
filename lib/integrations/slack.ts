import "server-only";

// ── Slack OAuth v2 + Web API client ───────────────────────────────────────────
// "Add to Slack" connects the tenant's Slack workspace ONCE (admin-authorized);
// we store the resulting BOT token (xoxb-…) encrypted per tenant in
// SlackConnection. This module owns both halves:
//   • OAuth: build the consent URL + exchange the code for a bot token
//     (oauth.v2.access). Host normalization mirrors lib/integrations/google.ts
//     (Slack, like Google, rejects `.localhost` redirect URIs).
//   • Web API: list channels, read a channel's recent messages, post a message,
//     and verify a token — thin fetch wrappers, no SDK.
//
// All calls are server-side only (the bot token never reaches the client). Slack
// always returns HTTP 200; success/failure is the JSON `ok` flag, surfaced here
// as a thrown SlackError.
//
// Requires the tenant's (or platform's) Slack app creds:
//   SLACK_CLIENT_ID, SLACK_CLIENT_SECRET   (env fallback; per-tenant override
//   lives in the Integration row config/secret — see getSlackOAuthCreds()).

const AUTH_URL = "https://slack.com/oauth/v2/authorize";
const ACCESS_URL = "https://slack.com/api/oauth.v2.access";
const API = "https://slack.com/api";

// Bot scopes the portal needs: read channel list, read history, post messages.
// `channels:*` = public channels; `groups:read` = private channels the bot is in.
export const SLACK_SCOPES = [
  "channels:read",
  "groups:read",
  "channels:history",
  "groups:history",
  "chat:write",
].join(",");

export class SlackError extends Error {
  status: number;
  /** Slack's raw `error` code (e.g. "bad_redirect_uri", "invalid_code"), when
   *  the failure came from a Slack API response. Surfaced into the callback's
   *  ?error= so the dashboard shows the real reason, not a generic message. */
  code?: string;
  constructor(message: string, status = 502, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** A tenant's (or the platform's) Slack OAuth app credentials. */
export interface SlackCreds {
  clientId: string;
  clientSecret: string;
}

/**
 * The request origin (scheme://host) Slack's flow should use, normalized so it
 * is always a VALID, registrable redirect host. Slack — like Google — rejects
 * `.localhost`; lvh.me is a real public domain that resolves to 127.0.0.1 in dev.
 * This is the single source of truth used by BOTH connect and callback (the token
 * exchange's redirect_uri must match the consent screen's exactly).
 */
export function originFromRequest(req: Request): string {
  const url = new URL(req.url);
  const rawHost = req.headers.get("host") ?? url.host;
  const [hostname, port] = rawHost.split(":");

  const isLocal =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "lvh.me" ||
    hostname.endsWith(".lvh.me") ||
    hostname === "127.0.0.1";

  // Public hosts always run OAuth over https (the registered redirect URI is
  // https); only local dev keeps http. Mirrors google.ts's reasoning.
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

/** The redirect URI Slack calls back. Prefer the explicit env; else derive from
 *  the (normalized) request origin. This is what each tenant's admin must add to
 *  THEIR Slack app's "Redirect URLs". */
export function redirectUri(origin: string): string {
  return (
    process.env.SLACK_OAUTH_REDIRECT_URI ||
    `${origin}/api/integrations/slack/callback`
  );
}

/** Build the "Add to Slack" consent URL. `state` is an opaque CSRF token we also
 *  set as a cookie and verify on callback. */
export function buildAuthUrl(
  creds: SlackCreds,
  origin: string,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: creds.clientId,
    scope: SLACK_SCOPES,
    redirect_uri: redirectUri(origin),
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface OAuthAccessResult {
  botToken: string;
  teamId: string;
  teamName: string | null;
}

/** Exchange an authorization code for the workspace BOT token (oauth.v2.access).
 *  Throws SlackError on any Slack-reported failure. */
export async function exchangeCode(
  creds: SlackCreds,
  code: string,
  origin: string,
): Promise<OAuthAccessResult> {
  // MUST be byte-identical to the redirect_uri sent to the consent screen, or
  // Slack rejects with `bad_redirect_uri`. Log it so a mismatch is diagnosable.
  const redirect = redirectUri(origin);
  console.log("[slack.exchangeCode] redirect_uri =", redirect);

  let res: Response;
  try {
    res = await fetch(ACCESS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        code,
        redirect_uri: redirect,
      }),
    });
  } catch {
    throw new SlackError("Could not reach Slack.", 502);
  }
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    access_token?: string; // the bot token (xoxb-…) in v2
    team?: { id?: string; name?: string };
  };
  if (!data.ok || !data.access_token) {
    // Carry Slack's raw code (e.g. bad_redirect_uri, invalid_code,
    // invalid_client_id, code_already_used) so the UI shows the real reason.
    console.error("[slack.exchangeCode] failed:", data.error ?? "unknown");
    throw new SlackError(
      `Slack rejected the connection (${data.error ?? "unknown"}).`,
      400,
      data.error,
    );
  }
  return {
    botToken: data.access_token,
    teamId: data.team?.id ?? "",
    teamName: data.team?.name ?? null,
  };
}

// ── Web API (bot token) ───────────────────────────────────────────────────────

async function slack<T>(
  method: string,
  token: string,
  body?: Record<string, unknown>,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body ?? {}),
      // Channel/message data is fine slightly stale; cache briefly to respect
      // Slack's rate limits on the dashboard's repeated loads.
      next: { revalidate: 30 },
    });
  } catch {
    throw new SlackError("Could not reach Slack.", 502);
  }
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
  } & T;
  if (!data.ok) {
    const err = data.error ?? `http_${res.status}`;
    if (err === "invalid_auth" || err === "token_revoked" || err === "account_inactive")
      throw new SlackError("Slack rejected the token — reconnect Slack.", 401);
    if (err === "missing_scope")
      throw new SlackError(
        "The Slack app is missing a required scope — reconnect Slack.",
        403,
      );
    throw new SlackError(`Slack error (${err}).`, 502);
  }
  return data;
}

/** Verify a bot token and return the connected workspace. Throws on bad token. */
export async function verifyToken(
  token: string,
): Promise<{ teamId: string; teamName: string }> {
  const r = await slack<{ team_id: string; team: string }>("auth.test", token);
  return { teamId: r.team_id, teamName: r.team };
}

export interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
  isMember: boolean;
  topic: string;
}

/** List the workspace's channels (public + private the bot is in), most-active
 *  first isn't available cheaply, so we return them name-sorted. */
export async function listChannels(token: string): Promise<SlackChannel[]> {
  const r = await slack<{
    channels: {
      id: string;
      name: string;
      is_private?: boolean;
      is_member?: boolean;
      is_archived?: boolean;
      topic?: { value?: string };
    }[];
  }>("conversations.list", token, {
    types: "public_channel,private_channel",
    exclude_archived: true,
    limit: 200,
  });
  return (r.channels ?? [])
    .filter((c) => !c.is_archived)
    .map((c) => ({
      id: c.id,
      name: c.name,
      isPrivate: !!c.is_private,
      isMember: !!c.is_member,
      topic: c.topic?.value ?? "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface SlackMessage {
  ts: string;
  user: string | null;
  text: string;
}

/** Read a channel's most recent messages (newest first). */
export async function channelHistory(
  token: string,
  channelId: string,
  limit = 25,
): Promise<SlackMessage[]> {
  const r = await slack<{
    messages: { ts: string; user?: string; bot_id?: string; text?: string }[];
  }>("conversations.history", token, { channel: channelId, limit });
  return (r.messages ?? []).map((m) => ({
    ts: m.ts,
    user: m.user ?? (m.bot_id ? "bot" : null),
    text: m.text ?? "",
  }));
}

/** Post a message to a channel as the bot. Returns the message ts on success. */
export async function postMessage(
  token: string,
  channelId: string,
  text: string,
): Promise<{ ts: string }> {
  const r = await slack<{ ts: string }>("chat.postMessage", token, {
    channel: channelId,
    text,
  });
  return { ts: r.ts };
}

/**
 * Fire a portal event into the tenant's configured Slack notify channel, if any.
 * Best-effort and NEVER throws — mirrors lib/push.ts / lib/notifications.ts: a
 * failed Slack post must never break the action (task assignment, …) that
 * triggered the notification. No-ops when Slack isn't connected, the tile is off,
 * or no notify channel is set.
 *
 * Takes an EXPLICIT tenantId and uses `adminDb` (NOT ambient ALS) because the
 * notify() fan-out fires after the request's tenant context may have unwound —
 * the same reason sendPushToUser/driveStorage take a tenantId (see [[multi-tenant]]).
 */
export async function notifySlackChannel(
  tenantId: string,
  text: string,
): Promise<void> {
  try {
    // Imported lazily to keep this provider module free of a top-level dep on the
    // DB/crypto layers (avoids import cycles with integrationsServer).
    const { adminDb } = await import("../db");
    const { open } = await import("../cryptoBox");

    const integ = await adminDb.integration.findFirst({
      where: { tenantId, provider: "slack" },
      select: { enabled: true },
    });
    if (!integ?.enabled) return;

    const conn = await adminDb.slackConnection.findUnique({
      where: { tenantId },
      select: { botToken: true, notifyChannelId: true },
    });
    if (!conn?.notifyChannelId) return;

    const botToken = open(conn.botToken);
    if (!botToken) return;

    await postMessage(botToken, conn.notifyChannelId, text);
  } catch (err) {
    console.error("[slack] notifySlackChannel failed", err);
  }
}

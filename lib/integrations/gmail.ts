import "server-only";
import { refreshAccessToken, type GoogleCreds } from "./google";
import { open } from "../cryptoBox";

// ── Gmail client ──────────────────────────────────────────────────────────────
// Thin fetch wrapper over the Gmail REST API v1, authenticated with a short-lived
// access token minted from the connected (owner's) Google refresh token — the
// SAME connection Drive uses. Three operations the portal needs:
//   • listInbox  — recent inbox messages (subject/from/snippet/date) for the dash
//   • getMessage — one message's headers + plain-text body for the reader
//   • sendEmail  — compose & send (RFC-2822 → base64url → messages/send)
//
// All calls are server-side only (the token never reaches the client). Scopes:
// gmail.readonly (read) + gmail.send (send). Errors surface as GmailError with a
// friendly message + status; an insufficient-scope 403 tells the caller to
// reconnect (the owner's Drive connection may predate the Gmail scopes).

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export class GmailError extends Error {
  status: number;
  /** True when Gmail rejected for missing scope — the UI prompts a reconnect. */
  needsReconnect: boolean;
  constructor(message: string, status: number, needsReconnect = false) {
    super(message);
    this.status = status;
    this.needsReconnect = needsReconnect;
  }
}

/** Get a usable access token from an ENCRYPTED refresh token (as stored in DB).
 *  Mirrors driveStorage.accessTokenFromSealed but throws GmailError. */
export async function accessTokenFromSealed(
  creds: GoogleCreds,
  sealedRefresh: string,
): Promise<string> {
  const refresh = open(sealedRefresh);
  if (!refresh) throw new GmailError("Stored Google token is unreadable.", 401, true);
  try {
    const { accessToken } = await refreshAccessToken(creds, refresh);
    return accessToken;
  } catch {
    throw new GmailError(
      "Google connection expired — reconnect your account.",
      401,
      true,
    );
  }
}

async function gmail<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      // Inbox/message data is fine slightly stale; brief cache for repeat loads.
      next: init?.method && init.method !== "GET" ? undefined : { revalidate: 30 },
    });
  } catch {
    throw new GmailError("Could not reach Gmail.", 502);
  }
  if (res.status === 401)
    throw new GmailError("Google rejected the token — reconnect.", 401, true);
  if (res.status === 403) {
    // Most commonly an insufficient-scope error (connection lacks Gmail scopes).
    throw new GmailError(
      "Gmail access isn’t granted — reconnect your Google account to enable email.",
      403,
      true,
    );
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new GmailError(`Gmail error (${res.status}). ${detail}`.trim(), res.status);
  }
  return (await res.json()) as T;
}

export interface InboxMessage {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  date: string; // raw header value
  unread: boolean;
}

function header(headers: { name: string; value: string }[], name: string): string {
  return (
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ""
  );
}

/** List recent inbox messages (metadata only — fast). Two-step: list ids, then
 *  fetch each message's metadata in parallel. */
export async function listInbox(
  token: string,
  max = 15,
): Promise<InboxMessage[]> {
  const list = await gmail<{ messages?: { id: string; threadId: string }[] }>(
    `/messages?labelIds=INBOX&maxResults=${max}`,
    token,
  );
  const ids = list.messages ?? [];
  const detailed = await Promise.all(
    ids.map((m) =>
      gmail<{
        id: string;
        threadId: string;
        snippet: string;
        labelIds?: string[];
        payload: { headers: { name: string; value: string }[] };
      }>(
        `/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        token,
      ).catch(() => null),
    ),
  );
  return detailed
    .filter((m): m is NonNullable<typeof m> => !!m)
    .map((m) => ({
      id: m.id,
      threadId: m.threadId,
      from: header(m.payload.headers, "From"),
      subject: header(m.payload.headers, "Subject") || "(no subject)",
      snippet: m.snippet ?? "",
      date: header(m.payload.headers, "Date"),
      unread: (m.labelIds ?? []).includes("UNREAD"),
    }));
}

export interface FullMessage extends InboxMessage {
  to: string;
  body: string; // plain text (decoded)
}

/** Recursively pull the first text/plain part's decoded body from a payload. */
function extractPlainBody(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf8");
  }
  for (const part of payload.parts ?? []) {
    const found = extractPlainBody(part);
    if (found) return found;
  }
  // Fallback: a single-part HTML-only message — strip tags crudely.
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url")
      .toString("utf8")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return "";
}

/** Fetch one message's headers + plain-text body for the reader. */
export async function getMessage(token: string, id: string): Promise<FullMessage> {
  const m = await gmail<{
    id: string;
    threadId: string;
    snippet: string;
    labelIds?: string[];
    payload: any;
  }>(`/messages/${id}?format=full`, token);
  const headers = m.payload?.headers ?? [];
  return {
    id: m.id,
    threadId: m.threadId,
    from: header(headers, "From"),
    to: header(headers, "To"),
    subject: header(headers, "Subject") || "(no subject)",
    snippet: m.snippet ?? "",
    date: header(headers, "Date"),
    unread: (m.labelIds ?? []).includes("UNREAD"),
    body: extractPlainBody(m.payload),
  };
}

export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
  /** The connected account's address, used as the From header. */
  from: string;
}

/** Build an RFC-2822 message and send it (messages/send, base64url-encoded raw).
 *  Returns the sent message id. */
export async function sendEmail(
  token: string,
  input: SendEmailInput,
): Promise<{ id: string }> {
  // Encode non-ASCII subjects per RFC 2047 so headers stay 7-bit clean.
  const encSubject = /[^\x00-\x7F]/.test(input.subject)
    ? `=?UTF-8?B?${Buffer.from(input.subject, "utf8").toString("base64")}?=`
    : input.subject;

  const mime = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${encSubject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    input.body,
  ].join("\r\n");

  const raw = Buffer.from(mime, "utf8").toString("base64url");

  const res = await gmail<{ id: string }>("/messages/send", token, {
    method: "POST",
    body: JSON.stringify({ raw }),
  });
  return { id: res.id };
}

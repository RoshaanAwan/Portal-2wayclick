import "server-only";
import { adminDb } from "../db";
import { runWithTenant } from "../tenantContext";
import { getGoogleOAuthCreds } from "../integrationsServer";
import { SCOPE_GMAIL_SEND, SCOPE_GMAIL_READ } from "./google";
import {
  accessTokenFromSealed,
  listInbox,
  getMessage,
  sendEmail,
  GmailError,
  type InboxMessage,
  type FullMessage,
} from "./gmail";

// ── Tenant Gmail (the workspace mailbox) ──────────────────────────────────────
// The model mirrors driveStorage.ts: ONE Google account per tenant — the Company
// Owner's. The owner OAuth-connects once (the SAME GoogleDriveConnection row that
// Drive uses; Gmail just needs extra scopes on it). The portal then sends email AS
// that account and reads ITS inbox. Regular users never connect.
//
// Like driveStorage, every function takes an EXPLICIT tenantId and uses `adminDb`
// (the ALS tenant context can be dropped across awaits in API routes — see the
// note in driveStorage.ts); getGoogleOAuthCreds (scoped db) is wrapped in
// runWithTenant.

/** Thrown when the owner hasn't connected Google — callers surface "ask the owner
 *  to connect" with no fallback. */
export class GmailNotConnectedError extends Error {
  constructor(
    message = "This workspace’s Google account isn’t connected. Ask the company owner to connect it in Integrations.",
  ) {
    super(message);
    this.name = "GmailNotConnectedError";
  }
}

/** The owner's Google connection for a tenant (the SUPER_ADMIN's), or null. */
async function tenantOwnerConnection(tenantId: string) {
  return adminDb.googleDriveConnection.findFirst({
    where: { tenantId, user: { role: "SUPER_ADMIN" } },
    orderBy: { connectedAt: "asc" },
    select: {
      refreshToken: true,
      googleEmail: true,
      googleScopes: true,
      userId: true,
    },
  });
}

function hasGmailSend(scopes: string | null | undefined): boolean {
  return !!scopes && scopes.split(/\s+/).includes(SCOPE_GMAIL_SEND);
}
function hasGmailRead(scopes: string | null | undefined): boolean {
  return !!scopes && scopes.split(/\s+/).includes(SCOPE_GMAIL_READ);
}

/** Status for the Gmail dashboard + admin card: is Google connected at all, and
 *  does that connection carry the Gmail scopes (else the owner must reconnect)? */
export async function tenantGmailStatus(tenantId: string): Promise<{
  /** A Google account is connected (Drive or Gmail). */
  connected: boolean;
  email: string | null;
  /** The connection granted gmail.send (can send mail). */
  canSend: boolean;
  /** The connection granted gmail.readonly (can read the inbox). */
  canRead: boolean;
  /** Connected but missing one or both Gmail scopes → prompt a reconnect. */
  needsReconnect: boolean;
}> {
  try {
    const conn = await tenantOwnerConnection(tenantId);
    if (!conn) {
      return { connected: false, email: null, canSend: false, canRead: false, needsReconnect: false };
    }
    const canSend = hasGmailSend(conn.googleScopes);
    const canRead = hasGmailRead(conn.googleScopes);
    return {
      connected: true,
      email: conn.googleEmail ?? null,
      canSend,
      canRead,
      needsReconnect: !canSend || !canRead,
    };
  } catch {
    return { connected: false, email: null, canSend: false, canRead: false, needsReconnect: false };
  }
}

/** Resolve an access token for the tenant's owner Google account. Throws
 *  GmailNotConnectedError when no owner connection / no creds. */
async function ownerAccessToken(tenantId: string): Promise<{ token: string; email: string | null }> {
  const conn = await tenantOwnerConnection(tenantId);
  if (!conn) throw new GmailNotConnectedError();

  const creds = await runWithTenant(tenantId, () => getGoogleOAuthCreds());
  if (!creds) {
    throw new GmailNotConnectedError(
      "Google isn’t configured for this workspace. Ask the company owner to set it up in Integrations.",
    );
  }
  const token = await accessTokenFromSealed(creds, conn.refreshToken);
  return { token, email: conn.googleEmail };
}

/** List the workspace mailbox's recent inbox messages. */
export async function listTenantInbox(
  tenantId: string,
  max = 15,
): Promise<InboxMessage[]> {
  const { token } = await ownerAccessToken(tenantId);
  return listInbox(token, max);
}

/** Read one message from the workspace mailbox. */
export async function readTenantMessage(
  tenantId: string,
  id: string,
): Promise<FullMessage> {
  const { token } = await ownerAccessToken(tenantId);
  return getMessage(token, id);
}

/** Send an email AS the workspace mailbox. The From header is the connected
 *  account's address (Gmail enforces this anyway). */
export async function sendTenantEmail(
  tenantId: string,
  input: { to: string; subject: string; body: string },
): Promise<{ id: string }> {
  const { token, email } = await ownerAccessToken(tenantId);
  return sendEmail(token, {
    to: input.to,
    subject: input.subject,
    body: input.body,
    from: email ?? "me",
  });
}

export { GmailError };

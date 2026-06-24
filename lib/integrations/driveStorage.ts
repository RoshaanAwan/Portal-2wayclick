import "server-only";
import { adminDb } from "../db";
import { runWithTenant } from "../tenantContext";
import { getGoogleOAuthCreds } from "../integrationsServer";
import {
  accessTokenFromSealed,
  uploadFile,
  listFiles,
  fetchFileMedia,
  DriveError,
  type DriveFile,
} from "./googleDrive";

// ── Tenant Drive storage ──────────────────────────────────────────────────────
// The model: ONE Google Drive per tenant — the Company Owner's. The owner does
// the OAuth connect once; thereafter every member's portal upload (documents,
// avatars, finance receipts, the explicit Drive page) lands in the owner's
// Drive, which is the tenant's storage backend. Regular users never connect.
//
// This module resolves "the tenant's Drive" (the owner's connection) and uploads
// to it. It is NOT user-scoped — the uploader is usually NOT the owner — so it
// finds the owner's connection within the current tenant. The scoped `db` keeps
// every query pinned to the tenant; we further restrict to the owner's row.

/** Thrown when the tenant's owner hasn't connected a Drive — callers surface a
 *  clear "ask your owner to connect Google Drive" message (no silent fallback). */
export class DriveNotConnectedError extends Error {
  constructor(
    message = "This workspace’s Google Drive isn’t connected. Ask the company owner to connect it in Integrations.",
  ) {
    super(message);
    this.name = "DriveNotConnectedError";
  }
}

// NOTE on tenant context: these are called from upload routes AFTER awaits
// (req.formData / fetch) that can drop the AsyncLocalStorage tenant context. So
// every function takes an EXPLICIT tenantId and uses `adminDb` (un-scoped) with
// an explicit `tenantId` filter — never relying on ambient ALS for the query.
// getGoogleOAuthCreds() (which uses the scoped db) is wrapped in runWithTenant.

/** The owner's Drive connection row for a tenant, or null. The owner is the
 *  SUPER_ADMIN; earliest-connected wins if there were ever more than one. */
async function tenantOwnerConnection(tenantId: string) {
  return adminDb.googleDriveConnection.findFirst({
    where: { tenantId, user: { role: "SUPER_ADMIN" } },
    orderBy: { connectedAt: "asc" },
    select: { refreshToken: true, folderId: true, googleEmail: true, userId: true },
  });
}

/** Whether the tenant has a connected owner Drive (for UI gating / preflight). */
export async function tenantDriveConnected(tenantId: string): Promise<boolean> {
  try {
    return !!(await tenantOwnerConnection(tenantId));
  } catch {
    return false;
  }
}

/** A short status for the dashboard: connected + which account. */
export async function tenantDriveStatus(tenantId: string): Promise<{
  connected: boolean;
  email: string | null;
}> {
  try {
    const conn = await tenantOwnerConnection(tenantId);
    return { connected: !!conn, email: conn?.googleEmail ?? null };
  } catch {
    return { connected: false, email: null };
  }
}

/** Mint an access token for the tenant's owner Drive. Throws DriveNotConnected
 *  if the owner hasn't connected, or DriveError if the token can't be refreshed. */
async function tenantDriveAccessToken(tenantId: string): Promise<{
  token: string;
  folderId: string | null;
}> {
  const conn = await tenantOwnerConnection(tenantId);
  if (!conn) throw new DriveNotConnectedError();
  // getGoogleOAuthCreds reads the scoped db → run it with the tenant active.
  const creds = await runWithTenant(tenantId, () => getGoogleOAuthCreds());
  if (!creds) {
    throw new DriveNotConnectedError(
      "Google isn’t configured for this workspace. Ask the company owner to set it up in Integrations.",
    );
  }
  const token = await accessTokenFromSealed(creds, conn.refreshToken);
  return { token, folderId: conn.folderId };
}

/**
 * Upload a file into the tenant's (owner's) Drive. Returns the Drive file's
 * metadata; callers persist `webContentLink` (for images/avatars) or `webViewLink`/id
 * (for documents) as the stored URL. Throws DriveNotConnectedError (→ 400 with a
 * friendly message) when not connected.
 */
export async function uploadToTenantDrive(
  tenantId: string,
  file: { name: string; mimeType: string; bytes: Buffer },
): Promise<DriveFile> {
  const { token, folderId } = await tenantDriveAccessToken(tenantId);
  return uploadFile(token, file, { folderId });
}

/**
 * Stream the raw bytes of a file from the tenant's (owner's) Drive, authenticated
 * through the same persistent owner connection used for uploads. Used by the
 * avatar proxy so PRIVATE (drive.file-scoped) images render. Throws
 * DriveNotConnectedError / DriveError on failure.
 */
export async function fetchTenantDriveMedia(
  tenantId: string,
  fileId: string,
): Promise<{ bytes: Buffer; contentType: string }> {
  const { token } = await tenantDriveAccessToken(tenantId);
  return fetchFileMedia(token, fileId);
}

/** List files in the tenant's Drive (for the dashboard). Empty list if not
 *  connected (the dashboard shows its own connect prompt). */
export async function listTenantDriveFiles(tenantId: string): Promise<DriveFile[]> {
  try {
    const { token, folderId } = await tenantDriveAccessToken(tenantId);
    return await listFiles(token, { folderId, pageSize: 50 });
  } catch {
    return [];
  }
}

export { DriveError };

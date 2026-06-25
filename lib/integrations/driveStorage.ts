import "server-only";
import { adminDb } from "../db";
import { runWithTenant } from "../tenantContext";
import { getGoogleOAuthCreds } from "../integrationsServer";
import { parseDriveFolderId } from "./google";
import {
  accessTokenFromSealed,
  uploadFile,
  listFiles,
  fetchFileMedia,
  deleteFile,
  getFolder,
  createFolder,
  setAnyoneWithLink,
  DriveError,
  type DriveFile,
} from "./googleDrive";
import {
  ensureTenantSections,
  resolveTenantSubfolder,
  readMap,
  type FolderMap,
} from "./driveTree";

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
    select: {
      refreshToken: true,
      folderId: true,
      folderName: true,
      folderShared: true,
      folderMap: true,
      googleEmail: true,
      userId: true,
    },
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

/** A short status for the dashboard: connected + which account + which folder.
 *  `folderId` null after connect means the owner still needs to pick a folder
 *  (the connect flow is two steps: OAuth, then paste the destination folder). */
export async function tenantDriveStatus(tenantId: string): Promise<{
  connected: boolean;
  email: string | null;
  folderId: string | null;
  folderName: string | null;
  /** Link-sharing on the destination folder: true = "anyone with the link can
   *  view", false = Restricted. Meaningless until a folder is set (folderId). */
  folderShared: boolean;
}> {
  try {
    const conn = await tenantOwnerConnection(tenantId);
    return {
      connected: !!conn,
      email: conn?.googleEmail ?? null,
      folderId: conn?.folderId ?? null,
      folderName: conn?.folderName ?? null,
      folderShared: conn?.folderShared ?? true,
    };
  } catch {
    return {
      connected: false,
      email: null,
      folderId: null,
      folderName: null,
      folderShared: true,
    };
  }
}

/**
 * Set (or change) the workspace destination folder from a pasted Drive folder
 * URL. Validates the folder is reachable + writable by the owner's account, then
 * creates a dedicated portal subfolder INSIDE it so the portal's files stay
 * tidily grouped (and never mixed with the owner's other files in that folder).
 * The created subfolder's id/name is what we persist + upload into.
 *
 * Owner-scoped: pass the OWNER's userId (the only connection that backs the
 * tenant Drive). Throws DriveNotConnectedError / DriveError on failure.
 */
export async function setTenantDriveFolder(
  tenantId: string,
  ownerUserId: string,
  folderUrl: string,
  subfolderName: string,
): Promise<{ folderId: string; folderName: string; webViewLink: string | null }> {
  const parsedId = parseDriveFolderId(folderUrl);
  if (!parsedId) {
    throw new DriveError(
      "That doesn’t look like a Google Drive folder link. Paste the URL from the folder’s address bar.",
      400,
    );
  }

  const conn = await adminDb.googleDriveConnection.findFirst({
    where: { tenantId, userId: ownerUserId },
    select: { refreshToken: true, folderShared: true },
  });
  if (!conn) throw new DriveNotConnectedError();

  const creds = await runWithTenant(tenantId, () => getGoogleOAuthCreds());
  if (!creds) {
    throw new DriveNotConnectedError(
      "Google isn’t configured for this workspace. Ask the company owner to set it up in Integrations.",
    );
  }
  const token = await accessTokenFromSealed(creds, conn.refreshToken);

  // 1. Confirm the pasted folder is real + writable by this account.
  await getFolder(token, parsedId);
  // 2. Create the portal's own MAIN subfolder inside it.
  const sub = await createFolder(token, subfolderName, parsedId);

  // 3. Apply the link-sharing preference to the new subfolder so uploads inherit
  //    it. Carry over the owner's existing choice; first-time setup defaults to
  //    "anyone with the link" (folderShared defaults true). Best-effort — a
  //    sharing failure shouldn't block setting the folder, so swallow it.
  const shared = conn.folderShared;
  try {
    await setAnyoneWithLink(token, sub.id, shared);
  } catch (err) {
    console.error("[setTenantDriveFolder] sharing failed", err);
  }

  // 4. Auto-create the top-level section folders (Projects, Documents, Invoices,
  //    Tasks, Avatars) inside the main folder. Category subfolders under
  //    Documents are created lazily on first upload. Best-effort: if the tree
  //    can't be built we still set the main folder (uploads fall back to it), so
  //    a Drive hiccup never blocks finishing setup.
  let folderMap: FolderMap = {};
  try {
    folderMap = await ensureTenantSections(token, sub.id, shared);
  } catch (err) {
    console.error("[setTenantDriveFolder] section tree failed", err);
  }

  await adminDb.googleDriveConnection.update({
    where: { userId: ownerUserId },
    data: {
      folderId: sub.id,
      folderName: sub.name,
      folderShared: shared,
      // Reset the map for the new main folder (old subfolder ids are stale).
      folderMap,
    },
  });

  return { folderId: sub.id, folderName: sub.name, webViewLink: sub.webViewLink };
}

/**
 * Flip link-sharing on the tenant's existing destination folder. Sets (or
 * removes) "anyone with the link can view" on the portal subfolder, then persists
 * the choice. Owner-scoped. Throws DriveNotConnectedError if no folder is set, or
 * DriveError on a Drive failure (the caller surfaces it — unlike folder creation,
 * the toggle's whole purpose IS the sharing change, so we don't swallow it).
 */
export async function setTenantDriveFolderSharing(
  tenantId: string,
  ownerUserId: string,
  shared: boolean,
): Promise<void> {
  const conn = await adminDb.googleDriveConnection.findFirst({
    where: { tenantId, userId: ownerUserId },
    select: { refreshToken: true, folderId: true },
  });
  if (!conn) throw new DriveNotConnectedError();
  if (!conn.folderId) {
    throw new DriveNotConnectedError(
      "Set a destination folder first, then choose its sharing.",
    );
  }

  const creds = await runWithTenant(tenantId, () => getGoogleOAuthCreds());
  if (!creds) {
    throw new DriveNotConnectedError(
      "Google isn’t configured for this workspace. Ask the company owner to set it up in Integrations.",
    );
  }
  const token = await accessTokenFromSealed(creds, conn.refreshToken);

  await setAnyoneWithLink(token, conn.folderId, shared);

  await adminDb.googleDriveConnection.update({
    where: { userId: ownerUserId },
    data: { folderShared: shared },
  });
}

/** Mint an access token for the tenant's owner Drive. Throws DriveNotConnected
 *  if the owner hasn't connected, or DriveError if the token can't be refreshed.
 *  Returns the connection bits the subfolder resolver needs. */
async function tenantDriveAccessToken(tenantId: string): Promise<{
  token: string;
  folderId: string | null;
  folderShared: boolean;
  folderMap: FolderMap;
  ownerUserId: string;
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
  return {
    token,
    folderId: conn.folderId,
    folderShared: conn.folderShared,
    folderMap: readMap(conn.folderMap),
    ownerUserId: conn.userId,
  };
}

/**
 * Upload a file into the tenant's (owner's) Drive. Returns the Drive file's
 * metadata; callers persist `webContentLink` (for images/avatars) or `webViewLink`/id
 * (for documents) as the stored URL. Throws DriveNotConnectedError (→ 400 with a
 * friendly message) when not connected.
 *
 * `opts.subfolderPath` routes the file into a section of the auto-created tree —
 * e.g. "Documents/Legal", "Invoices", "Tasks", "Projects". The path is resolved
 * (and any missing segment created + cached) under the main folder; if it can't
 * be resolved we fall back to the main folder so an upload never hard-fails on a
 * folder-tree issue. Omit it to land directly in the main folder (legacy
 * behavior).
 */
export async function uploadToTenantDrive(
  tenantId: string,
  file: { name: string; mimeType: string; bytes: Buffer },
  opts: { subfolderPath?: string | null } = {},
): Promise<DriveFile> {
  const { token, folderId, folderShared, folderMap, ownerUserId } =
    await tenantDriveAccessToken(tenantId);
  // Connect is two steps: OAuth, then choose a destination folder. If the owner
  // hasn't chosen one yet, refuse rather than scatter files into My Drive root.
  if (!folderId) {
    throw new DriveNotConnectedError(
      "The workspace Drive folder isn’t set yet. Ask the company owner to choose a folder in Integrations.",
    );
  }

  let destFolderId = folderId;
  if (opts.subfolderPath) {
    try {
      const resolved = await resolveTenantSubfolder(
        { token, ownerUserId, mainFolderId: folderId, shared: folderShared, map: folderMap },
        opts.subfolderPath,
      );
      destFolderId = resolved.folderId;
    } catch (err) {
      // A folder-tree failure must not lose the upload — fall back to the main
      // folder so the file still lands somewhere retrievable.
      console.error(
        "[uploadToTenantDrive] subfolder resolve failed; using main folder",
        opts.subfolderPath,
        err,
      );
    }
  }

  return uploadFile(token, file, { folderId: destFolderId });
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

/**
 * Delete a file from the tenant's (owner's) Drive by id. Best-effort: swallows a
 * "not connected" state (nothing to authenticate against — the file is
 * effectively unreachable anyway) but propagates a real DriveError so callers can
 * decide whether to surface it. Used to clean up a card attachment's Drive file
 * when the attachment row is removed.
 */
export async function deleteFromTenantDrive(
  tenantId: string,
  fileId: string,
): Promise<void> {
  let token: string;
  try {
    ({ token } = await tenantDriveAccessToken(tenantId));
  } catch (e) {
    if (e instanceof DriveNotConnectedError) return;
    throw e;
  }
  await deleteFile(token, fileId);
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

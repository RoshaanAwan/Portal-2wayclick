import "server-only";
import { refreshAccessToken, type GoogleCreds } from "./google";
import { open } from "../cryptoBox";

// ── Google Drive client ───────────────────────────────────────────────────────
// Thin fetch wrapper over the Drive v3 REST API, authenticated with a short-lived
// access token minted from the user's stored refresh token. Two operations the
// portal needs: list the files this app has touched, and upload a new file into
// the user's Drive (optionally a specific folder).
//
// Scope is drive.file, so listing only ever returns files the portal created —
// exactly the "files I uploaded here" view we want, never the user's whole Drive.

const FILES_API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export interface DriveFolder {
  id: string;
  name: string;
  webViewLink: string | null;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string | null;
  webContentLink: string | null;
  iconLink: string | null;
  thumbnailLink: string | null;
  size: number | null;
  modifiedTime: string;
}

export class DriveError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Get a usable access token from an ENCRYPTED refresh token (as stored in DB).
 *  Needs the tenant's Google app creds to call the token endpoint. */
export async function accessTokenFromSealed(
  creds: GoogleCreds,
  sealedRefresh: string,
): Promise<string> {
  const refresh = open(sealedRefresh);
  if (!refresh) throw new DriveError("Stored Google token is unreadable.", 401);
  try {
    const { accessToken } = await refreshAccessToken(creds, refresh);
    return accessToken;
  } catch {
    throw new DriveError(
      "Google connection expired — reconnect your account.",
      401,
    );
  }
}

interface RawFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  webContentLink?: string;
  iconLink?: string;
  thumbnailLink?: string;
  size?: string;
  modifiedTime: string;
}

/** List files the app created, most recently modified first. */
export async function listFiles(
  accessToken: string,
  opts: { folderId?: string | null; pageSize?: number } = {},
): Promise<DriveFile[]> {
  const q = ["trashed = false"];
  if (opts.folderId) q.push(`'${opts.folderId}' in parents`);

  const params = new URLSearchParams({
    q: q.join(" and "),
    orderBy: "modifiedTime desc",
    pageSize: String(opts.pageSize ?? 50),
    fields:
      "files(id,name,mimeType,webViewLink,webContentLink,iconLink,thumbnailLink,size,modifiedTime)",
  });

  let res: Response;
  try {
    res = await fetch(`${FILES_API}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
  } catch {
    throw new DriveError("Could not reach Google Drive.", 502);
  }
  if (res.status === 401)
    throw new DriveError("Google rejected the request — reconnect.", 401);
  if (!res.ok) throw new DriveError(`Drive error (${res.status}).`, res.status);

  const data = (await res.json()) as { files?: RawFile[] };
  return (data.files ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    webViewLink: f.webViewLink ?? null,
    webContentLink: f.webContentLink ?? null,
    iconLink: f.iconLink ?? null,
    thumbnailLink: f.thumbnailLink ?? null,
    size: f.size ? Number(f.size) : null,
    modifiedTime: f.modifiedTime,
  }));
}

/** Fetch a folder's metadata to confirm it EXISTS, is a folder, and the
 *  connected account can write to it. Throws DriveError otherwise — callers turn
 *  this into a friendly "we couldn't access that folder" message. */
export async function getFolder(
  accessToken: string,
  id: string,
): Promise<DriveFolder> {
  const params = new URLSearchParams({
    fields: "id,name,mimeType,webViewLink,capabilities/canAddChildren,trashed",
    supportsAllDrives: "true",
  });
  let res: Response;
  try {
    res = await fetch(`${FILES_API}/${encodeURIComponent(id)}?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
  } catch {
    throw new DriveError("Could not reach Google Drive.", 502);
  }
  if (res.status === 401)
    throw new DriveError("Google rejected the request — reconnect.", 401);
  if (res.status === 404)
    throw new DriveError(
      "That folder wasn’t found. Make sure the link is correct and the connected Google account can open it.",
      404,
    );
  if (!res.ok) throw new DriveError(`Drive error (${res.status}).`, res.status);

  const f = (await res.json()) as RawFile & {
    trashed?: boolean;
    capabilities?: { canAddChildren?: boolean };
  };
  if (f.mimeType !== FOLDER_MIME)
    throw new DriveError("That link points to a file, not a folder.", 400);
  if (f.trashed)
    throw new DriveError("That folder is in the trash.", 400);
  if (f.capabilities && f.capabilities.canAddChildren === false)
    throw new DriveError(
      "The connected Google account can’t add files to that folder. Give it edit access and try again.",
      403,
    );

  return { id: f.id, name: f.name, webViewLink: f.webViewLink ?? null };
}

/** Create a subfolder under `parentId` (or in My Drive if omitted) and return it.
 *  Used to auto-create the portal's own folder inside the owner's pasted folder. */
export async function createFolder(
  accessToken: string,
  name: string,
  parentId?: string | null,
): Promise<DriveFolder> {
  const metadata: Record<string, unknown> = { name, mimeType: FOLDER_MIME };
  if (parentId) metadata.parents = [parentId];

  const params = new URLSearchParams({
    fields: "id,name,webViewLink",
    supportsAllDrives: "true",
  });
  let res: Response;
  try {
    res = await fetch(`${FILES_API}?${params}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(metadata),
    });
  } catch {
    throw new DriveError("Could not reach Google Drive.", 502);
  }
  if (res.status === 401)
    throw new DriveError("Google rejected the request — reconnect.", 401);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new DriveError(
      `Couldn’t create the folder (${res.status}). ${detail.slice(0, 200)}`,
      res.status,
    );
  }
  const f = (await res.json()) as RawFile;
  return { id: f.id, name: f.name, webViewLink: f.webViewLink ?? null };
}

/**
 * Set (or clear) "anyone with the link can view" on a Drive file/folder. When
 * `enabled` is true, grants an `anyone` role=reader permission (so the file —
 * and, on a folder, everything inside it — opens via its link without sign-in).
 * When false, removes that permission, returning the item to Restricted (only
 * explicitly-granted people). Idempotent: re-enabling skips if already shared,
 * disabling is a no-op when no `anyone` permission exists.
 *
 * Needs the full `auth/drive` scope (which the portal requests).
 */
export async function setAnyoneWithLink(
  accessToken: string,
  fileId: string,
  enabled: boolean,
): Promise<void> {
  const base = `${FILES_API}/${encodeURIComponent(fileId)}/permissions`;
  const supports = "supportsAllDrives=true";

  // Find an existing `anyone`-type permission (Drive allows at most one).
  let listRes: Response;
  try {
    listRes = await fetch(`${base}?fields=permissions(id,type,role)&${supports}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
  } catch {
    throw new DriveError("Could not reach Google Drive.", 502);
  }
  if (listRes.status === 401)
    throw new DriveError("Google rejected the request — reconnect.", 401);
  if (!listRes.ok)
    throw new DriveError(`Drive error (${listRes.status}).`, listRes.status);

  const { permissions = [] } = (await listRes.json()) as {
    permissions?: Array<{ id: string; type: string; role: string }>;
  };
  const existing = permissions.find((p) => p.type === "anyone");

  if (enabled) {
    if (existing) return; // already link-shared
    let res: Response;
    try {
      res = await fetch(`${base}?${supports}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: "reader", type: "anyone" }),
      });
    } catch {
      throw new DriveError("Could not reach Google Drive.", 502);
    }
    if (res.status === 401)
      throw new DriveError("Google rejected the request — reconnect.", 401);
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new DriveError(
        `Couldn’t update sharing (${res.status}). ${detail.slice(0, 200)}`,
        res.status,
      );
    }
    return;
  }

  // Disable: remove the `anyone` permission if present.
  if (!existing) return; // already restricted
  let res: Response;
  try {
    res = await fetch(`${base}/${encodeURIComponent(existing.id)}?${supports}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new DriveError("Could not reach Google Drive.", 502);
  }
  // 204 = removed; 404 = already gone — both fine.
  if (res.ok || res.status === 404) return;
  if (res.status === 401)
    throw new DriveError("Google rejected the request — reconnect.", 401);
  throw new DriveError(`Couldn’t update sharing (${res.status}).`, res.status);
}

/** Upload a file (multipart) into the user's Drive, optionally under a folder. */
export async function uploadFile(
  accessToken: string,
  file: { name: string; mimeType: string; bytes: Buffer },
  opts: { folderId?: string | null } = {},
): Promise<DriveFile> {
  const metadata: Record<string, unknown> = { name: file.name };
  if (opts.folderId) metadata.parents = [opts.folderId];

  // Drive multipart/related upload: a JSON metadata part + the binary part.
  const boundary = "portal" + Math.abs(hash(file.name + file.bytes.length));
  const head =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${file.mimeType}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const body = Buffer.concat([
    Buffer.from(head, "utf8"),
    file.bytes,
    Buffer.from(tail, "utf8"),
  ]);

  const params = new URLSearchParams({
    uploadType: "multipart",
    fields:
      "id,name,mimeType,webViewLink,webContentLink,iconLink,thumbnailLink,size,modifiedTime",
  });

  let res: Response;
  try {
    res = await fetch(`${UPLOAD_API}?${params.toString()}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: new Uint8Array(body),
    });
  } catch {
    throw new DriveError("Could not reach Google Drive.", 502);
  }
  if (res.status === 401)
    throw new DriveError("Google rejected the upload — reconnect.", 401);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new DriveError(
      `Drive upload failed (${res.status}). ${detail.slice(0, 200)}`,
      res.status,
    );
  }
  const f = (await res.json()) as RawFile;
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    webViewLink: f.webViewLink ?? null,
    webContentLink: f.webContentLink ?? null,
    iconLink: f.iconLink ?? null,
    thumbnailLink: f.thumbnailLink ?? null,
    size: f.size ? Number(f.size) : null,
    modifiedTime: f.modifiedTime,
  };
}

/** Download the raw bytes of a Drive file via the authenticated media endpoint.
 *  Works for PRIVATE files (drive.file scope) — unlike the public
 *  drive.google.com/uc link, which returns a sign-in page for private files. */
export async function fetchFileMedia(
  accessToken: string,
  id: string,
): Promise<{ bytes: Buffer; contentType: string }> {
  const params = new URLSearchParams({ alt: "media" });
  let res: Response;
  try {
    res = await fetch(`${FILES_API}/${encodeURIComponent(id)}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
  } catch {
    throw new DriveError("Could not reach Google Drive.", 502);
  }
  if (res.status === 401)
    throw new DriveError("Google rejected the request — reconnect.", 401);
  if (res.status === 404)
    throw new DriveError("File not found in Drive.", 404);
  if (!res.ok) throw new DriveError(`Drive error (${res.status}).`, res.status);

  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  return { bytes: buf, contentType };
}

/** Delete a Drive file by id. Treats a 404 as success (already gone) so callers
 *  can clean up idempotently. Throws DriveError on a real failure. */
export async function deleteFile(
  accessToken: string,
  id: string,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${FILES_API}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new DriveError("Could not reach Google Drive.", 502);
  }
  // 204 = deleted; 404 = already gone — both are fine for our purposes.
  if (res.ok || res.status === 404) return;
  if (res.status === 401)
    throw new DriveError("Google rejected the request — reconnect.", 401);
  throw new DriveError(`Drive delete failed (${res.status}).`, res.status);
}

// Tiny deterministic hash for a stable-ish multipart boundary (avoids
// Math.random, which is fine here but keeps it pure).
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

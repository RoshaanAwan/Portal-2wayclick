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

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string | null;
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
      "files(id,name,mimeType,webViewLink,iconLink,thumbnailLink,size,modifiedTime)",
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
    iconLink: f.iconLink ?? null,
    thumbnailLink: f.thumbnailLink ?? null,
    size: f.size ? Number(f.size) : null,
    modifiedTime: f.modifiedTime,
  }));
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
      "id,name,mimeType,webViewLink,iconLink,thumbnailLink,size,modifiedTime",
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
    iconLink: f.iconLink ?? null,
    thumbnailLink: f.thumbnailLink ?? null,
    size: f.size ? Number(f.size) : null,
    modifiedTime: f.modifiedTime,
  };
}

// Tiny deterministic hash for a stable-ish multipart boundary (avoids
// Math.random, which is fine here but keeps it pure).
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

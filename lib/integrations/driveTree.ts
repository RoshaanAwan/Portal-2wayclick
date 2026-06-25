import "server-only";
import { adminDb } from "../db";
import { createFolder, setAnyoneWithLink, DriveError } from "./googleDrive";

// ── Tenant Drive folder tree ──────────────────────────────────────────────────
// The portal organizes uploads into a tidy tree inside the owner's main folder
// instead of dumping everything in one place:
//
//   <Company> – Portal/            ← the main folder (connection.folderId)
//   ├─ Projects/                   ← project files / card attachments by project
//   ├─ Documents/                  ← the document library
//   │   ├─ HR/  Engineering/  Finance/  Legal/  Brand/  General/   (by category)
//   ├─ Invoices/                   ← finance receipts / invoice PDFs
//   ├─ Tasks/                      ← task card image attachments
//   └─ Avatars/                    ← profile photos
//
// Each subfolder's Drive id is cached in connection.folderMap keyed by a logical
// PATH ("Documents/Legal"). Top-level sections are created up front when the
// folder is set (ensureTenantSections); deeper paths (a document category) are
// created lazily on first use (resolveTenantSubfolder) and cached. The cache
// keeps steady-state uploads to ONE Drive call (the upload itself).

/** Top-level sections, created up front when the main folder is set. */
export const DRIVE_SECTIONS = [
  "Projects",
  "Documents",
  "Invoices",
  "Tasks",
  "Avatars",
] as const;
export type DriveSection = (typeof DRIVE_SECTIONS)[number];

/** The map persisted on the connection: logical path → Drive folder id. */
export type FolderMap = Record<string, string>;

function readMap(raw: unknown): FolderMap {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const out: FolderMap = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  }
  return {};
}

/** Persist the folder map for the owner's connection (whole-map replace). */
async function saveMap(ownerUserId: string, map: FolderMap): Promise<void> {
  await adminDb.googleDriveConnection.update({
    where: { userId: ownerUserId },
    data: { folderMap: map },
  });
}

/**
 * Create the top-level section folders directly under `mainFolderId` and return
 * the resulting path→id map. Inherits the main folder's link-sharing onto each
 * section (best-effort) so uploads behave consistently. Called once when the
 * destination folder is (re)set — a fresh main folder always starts with no
 * sections, so we create all of DRIVE_SECTIONS.
 */
export async function ensureTenantSections(
  token: string,
  mainFolderId: string,
  shared: boolean,
): Promise<FolderMap> {
  const map: FolderMap = {};
  for (const section of DRIVE_SECTIONS) {
    const folder = await createFolder(token, section, mainFolderId);
    map[section] = folder.id;
    // Match the main folder's sharing; never let a sharing hiccup abort setup.
    try {
      await setAnyoneWithLink(token, folder.id, shared);
    } catch {
      /* best-effort */
    }
  }
  return map;
}

/**
 * Resolve a logical folder path (e.g. "Documents/Legal" or "Projects") to a Drive
 * folder id under the tenant's main folder, creating any missing segments on the
 * way and caching them. Returns the deepest segment's id.
 *
 * `path` segments are created in order; each newly-created segment inherits the
 * main folder's sharing. The cache (connection.folderMap) means a hit costs no
 * Drive calls. Pass the already-resolved `ctx` so this stays a pure helper that
 * the storage layer wires to the live token/connection.
 */
export async function resolveTenantSubfolder(
  ctx: {
    token: string;
    ownerUserId: string;
    mainFolderId: string;
    shared: boolean;
    map: FolderMap;
  },
  path: string,
): Promise<{ folderId: string; map: FolderMap; created: boolean }> {
  const segments = path.split("/").map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) {
    return { folderId: ctx.mainFolderId, map: ctx.map, created: false };
  }

  const map = { ...ctx.map };
  let created = false;
  let parentId = ctx.mainFolderId;
  let accumulated = "";

  for (const segment of segments) {
    accumulated = accumulated ? `${accumulated}/${segment}` : segment;
    const cached = map[accumulated];
    if (cached) {
      parentId = cached;
      continue;
    }
    const folder = await createFolder(ctx.token, segment, parentId);
    map[accumulated] = folder.id;
    try {
      await setAnyoneWithLink(ctx.token, folder.id, ctx.shared);
    } catch {
      /* best-effort */
    }
    parentId = folder.id;
    created = true;
  }

  // Persist only when we actually added something new.
  if (created) await saveMap(ctx.ownerUserId, map);

  return { folderId: parentId, map, created };
}

export { readMap };
export { DriveError };

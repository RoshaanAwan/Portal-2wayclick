import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { runWithTenant } from "@/lib/tenantContext";
import {
  setTenantDriveFolder,
  DriveNotConnectedError,
  DriveError,
} from "@/lib/integrations/driveStorage";
import { getTenantById } from "@/lib/tenant";

// Step 2 of "Connect Google Drive": the Company Owner pastes the URL of an
// existing Drive folder they've granted their connected account edit access to.
// We validate it's a real, writable folder, then create a dedicated portal
// subfolder inside it and store that as the workspace upload destination.
// Owner-only — the owner's connection IS the tenant's Drive.

export async function POST(req: Request) {
  try {
    const user = await requireTenantUser();
    if (!isSuperAdmin(user.role)) {
      return NextResponse.json(
        { error: "Only the company owner can set the workspace Drive folder." },
        { status: 403 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const folderUrl = typeof body.folderUrl === "string" ? body.folderUrl : "";
    if (!folderUrl.trim()) {
      return NextResponse.json(
        { error: "Paste your Google Drive folder link." },
        { status: 400 },
      );
    }

    // Name the portal's subfolder after the workspace so it's recognizable in
    // the owner's Drive.
    const tenant = await getTenantById(user.tenantId);
    const subfolderName = `${tenant?.name ?? "Portal"} – Portal files`;

    const result = await setTenantDriveFolder(
      user.tenantId,
      user.id,
      folderUrl,
      subfolderName,
    );

    await runWithTenant(user.tenantId, () =>
      audit({
        actor: user,
        action: "integration.update",
        entity: "GoogleDriveConnection",
        entityId: user.id,
        targetUserId: user.id,
        summary: `${user.name} set the workspace Drive folder`,
        detail: { folderId: result.folderId, folderName: result.folderName },
      }),
    );

    return NextResponse.json({ ok: true, folder: result });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e instanceof DriveNotConnectedError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (e instanceof DriveError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[google.folder]", e);
    return NextResponse.json({ error: "Couldn’t set the folder." }, { status: 500 });
  }
}

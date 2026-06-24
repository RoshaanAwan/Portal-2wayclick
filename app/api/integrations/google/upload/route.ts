import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { runWithTenant } from "@/lib/tenantContext";
import {
  uploadToTenantDrive,
  DriveNotConnectedError,
  DriveError,
} from "@/lib/integrations/driveStorage";

// Uploads a file from the portal into the TENANT'S Google Drive (the company
// owner's connected Drive — the workspace storage). Any member can upload; it
// lands in the owner's Drive. The file never persists on the portal — it streams
// straight to Drive. Cap the size so a request can't buffer something huge.

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export async function POST(req: Request) {
  try {
    const user = await requireTenantUser();

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File must be 25 MB or smaller." },
        { status: 400 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadToTenantDrive(user.tenantId, {
      name: file.name || "upload",
      mimeType: file.type || "application/octet-stream",
      bytes,
    });

    await runWithTenant(user.tenantId, () =>
      audit({
        actor: user,
        action: "integration.update",
        entity: "GoogleDriveConnection",
        entityId: user.id,
        targetUserId: user.id,
        summary: `${user.name} uploaded "${uploaded.name}" to the workspace Drive`,
        detail: { fileId: uploaded.id, size: uploaded.size },
      }),
    );

    return NextResponse.json({ ok: true, file: uploaded });
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
    console.error("[google.upload]", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

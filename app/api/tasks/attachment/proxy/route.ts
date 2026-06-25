import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertTaskAccess } from "@/lib/taskAccess";
import {
  fetchTenantDriveMedia,
  DriveNotConnectedError,
  DriveError,
} from "@/lib/integrations/driveStorage";

// Streams a card image attachment out of the TENANT'S Google Drive through the
// portal. Drive uploads use the drive.file scope, so the file is private — it can
// only be read with an access token minted from the owner's stored refresh token,
// which fetchTenantDriveMedia does. A plain drive.google.com link would return a
// sign-in page instead.
//
// Authorized like the card itself: the attachment id resolves the task, then
// assertTaskAccess gates on the card's project (so a non-member can't read a
// private board's images by guessing ids). The scoped `db` keeps the lookup in
// the caller's tenant.
//
// Usage: /api/tasks/attachment/proxy?id=ATTACHMENT_ID
export async function GET(req: Request) {
  try {
    const user = await requireTenantUser();

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const attachment = await db.taskAttachment.findUnique({
      where: { id },
      select: { taskId: true, driveFileId: true, mimeType: true },
    });
    if (!attachment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const access = await assertTaskAccess(attachment.taskId, user);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.status === 404 ? "Not found" : "Forbidden" },
        { status: access.status },
      );
    }

    const { bytes, contentType } = await fetchTenantDriveMedia(
      user.tenantId,
      attachment.driveFileId,
    );

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentType || attachment.mimeType,
        // Private to the viewer; long-lived since attachment ids are immutable.
        "Cache-Control": "private, max-age=86400",
        "Content-Disposition": "inline",
      },
    });
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
    console.error("[tasks.attachment.proxy]", e);
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 500 });
  }
}

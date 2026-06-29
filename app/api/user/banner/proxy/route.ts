import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import {
  fetchTenantDriveMedia,
  DriveNotConnectedError,
  DriveError,
} from "@/lib/integrations/driveStorage";

// Streams a profile cover image out of the TENANT'S Google Drive (the company
// owner's connected Drive) through the portal. Same private-file trust model as
// the avatar proxy: uploads use the drive.file scope, so the file can only be
// read with an access token minted from the owner's stored refresh token.
//
// Usage: /api/user/banner/proxy?id=FILE_ID
export async function GET(req: Request) {
  try {
    const user = await requireTenantUser();

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing file ID" }, { status: 400 });
    }

    const { bytes, contentType } = await fetchTenantDriveMedia(user.tenantId, id);

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentType,
        // Private to the viewer; long-lived since banner IDs are immutable.
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
    console.error("[banner.proxy]", e);
    return NextResponse.json({ error: "Failed to fetch banner" }, { status: 500 });
  }
}

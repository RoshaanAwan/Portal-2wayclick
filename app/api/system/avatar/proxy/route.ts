import { NextResponse } from "next/server";
import { requireSystemOwner } from "@/lib/auth";
import { adminDb } from "@/lib/db";
import {
  accessTokenFromSealed,
  fetchFileMedia,
  DriveError,
} from "@/lib/integrations/googleDrive";

// Streams the system owner's avatar out of THEIR OWN connected Google Drive.
// Mirrors the system avatar upload route: the connection is keyed by the owner's
// userId and authenticated with the platform Google app creds (env). Uploads use
// the drive.file scope (private), so the file is fetched with an access token —
// a plain drive.google.com/uc link would return a sign-in page instead.
//
// Usage: /api/system/avatar/proxy?id=FILE_ID
export async function GET(req: Request) {
  try {
    const actor = await requireSystemOwner();

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing file ID" }, { status: 400 });
    }

    const conn = await adminDb.googleDriveConnection.findUnique({
      where: { userId: actor.id },
      select: { refreshToken: true },
    });
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!conn || !clientId || !clientSecret) {
      return NextResponse.json(
        { error: "Google Drive isn’t connected." },
        { status: 400 },
      );
    }

    const token = await accessTokenFromSealed(
      { clientId, clientSecret },
      conn.refreshToken,
    );
    const { bytes, contentType } = await fetchFileMedia(token, id);

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=86400",
        "Content-Disposition": "inline",
      },
    });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED" || e?.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e instanceof DriveError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[system.avatar.proxy]", e);
    return NextResponse.json({ error: "Failed to fetch avatar" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { requireSystemOwner } from "@/lib/auth";
import { adminDb } from "@/lib/db";
import { accessTokenFromSealed, uploadFile, DriveError } from "@/lib/integrations/googleDrive";

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// POST /api/system/avatar
// Stores to Drive if connected, base64 data URL otherwise.
export async function POST(req: Request) {
  try {
    const actor = await requireSystemOwner();

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File))
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    if (!ALLOWED.has(file.type))
      return NextResponse.json({ error: "Use a JPEG, PNG, WebP, or GIF image." }, { status: 400 });
    if (file.size > MAX_BYTES)
      return NextResponse.json({ error: "Image must be 4 MB or smaller." }, { status: 400 });

    const bytes = Buffer.from(await file.arrayBuffer());
    let avatarUrl: string;

    const conn = await adminDb.googleDriveConnection.findUnique({
      where: { userId: actor.id },
      select: { refreshToken: true, folderId: true },
    });

    if (conn) {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (clientId && clientSecret) {
        const token = await accessTokenFromSealed({ clientId, clientSecret }, conn.refreshToken);
        const uploaded = await uploadFile(token, {
          name: `avatar-${actor.id}.${file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png"}`,
          mimeType: file.type,
          bytes,
        }, { folderId: conn.folderId });
        avatarUrl = uploaded.webViewLink ?? `data:${file.type};base64,${bytes.toString("base64")}`;
      } else {
        avatarUrl = `data:${file.type};base64,${bytes.toString("base64")}`;
      }
    } else {
      avatarUrl = `data:${file.type};base64,${bytes.toString("base64")}`;
    }

    await adminDb.user.update({ where: { id: actor.id }, data: { avatarUrl } });
    return NextResponse.json({ ok: true, url: avatarUrl });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED" || e?.message === "FORBIDDEN")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e instanceof DriveError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[system.avatar]", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

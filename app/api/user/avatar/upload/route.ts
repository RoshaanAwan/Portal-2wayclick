import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import {
  uploadToTenantDrive,
  DriveNotConnectedError,
  DriveError,
} from "@/lib/integrations/driveStorage";

// Accepts a single image file (multipart/form-data, field "file") and saves it
// into the TENANT'S Google Drive (the company owner's connected Drive), returning
// a link to store on user.avatarUrl. No Vercel/base64 fallback: if the owner
// hasn't connected a Drive, the upload is blocked with a clear message.

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB — generous for a profile photo.
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(req: Request) {
  try {
    const user = await requireTenantUser();

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json(
        { error: "Use a JPEG, PNG, WebP, or GIF image." },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Image must be 4 MB or smaller." },
        { status: 400 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadToTenantDrive(user.tenantId, {
      name: `avatar-${user.id}.${file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png"}`,
      mimeType: file.type,
      bytes,
    });

    await audit({
      actor: user,
      action: "user.avatar_update",
      entity: "User",
      entityId: user.id,
      targetUserId: user.id,
      summary: `${user.name} updated their profile photo`,
      detail: { driveId: uploaded.id },
    });
    // Use proxy endpoint to serve Google Drive image, otherwise fall back to base64
    const url = uploaded.id
      ? `/api/user/avatar/proxy?id=${uploaded.id}`
      : `data:${file.type};base64,${bytes.toString("base64")}`;
    return NextResponse.json({ ok: true, url });
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
    console.error("[avatar.upload]", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

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
// a link to store on user.bannerUrl. Mirrors the avatar upload route, but for the
// profile cover image (a wide ~4:1 "LinkedIn" banner), so the size cap is larger.
// Drive only: if the owner hasn't connected a Drive, the upload is blocked with a
// clear message. There is NO base64 fallback (covers can be several MB).

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB — covers are larger than avatars.
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
        { error: "Image must be 8 MB or smaller." },
        { status: 400 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadToTenantDrive(
      user.tenantId,
      {
        name: `banner-${user.id}.${file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png"}`,
        mimeType: file.type,
        bytes,
      },
      { subfolderPath: "Banners" },
    );

    // Drive only — no base64 fallback. If Drive didn't return an id, treat it as
    // a failed upload rather than inlining a multi-MB data URL.
    if (!uploaded.id) {
      return NextResponse.json(
        { error: "Upload failed — Drive did not return a file." },
        { status: 502 },
      );
    }

    await audit({
      actor: user,
      action: "user.banner_update",
      entity: "User",
      entityId: user.id,
      targetUserId: user.id,
      summary: `${user.name} updated their profile cover`,
      detail: { driveId: uploaded.id },
    });

    return NextResponse.json({
      ok: true,
      url: `/api/user/banner/proxy?id=${uploaded.id}`,
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
    console.error("[banner.upload]", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

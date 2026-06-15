import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireUser } from "@/lib/auth";

// Accepts a single image file (multipart/form-data, field "file") and returns a
// hosted URL the caller can save to user.avatarUrl. Uploading to Vercel Blob
// keeps it off the DB and serves it via CDN. When BLOB_READ_WRITE_TOKEN isn't
// configured (local dev, first deploy) we fall back to an inline data URL so the
// feature still works end-to-end without extra setup.

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB — generous for a profile photo.
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(req: Request) {
  try {
    const user = await requireUser();

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

    const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";

    // Vercel Blob when configured; otherwise inline data URL as a fallback.
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(`avatars/${user.id}.${ext}`, file, {
        access: "public",
        addRandomSuffix: true, // bust CDN cache on re-upload
        contentType: file.type,
      });
      return NextResponse.json({ ok: true, url: blob.url });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const dataUrl = `data:${file.type};base64,${bytes.toString("base64")}`;
    return NextResponse.json({ ok: true, url: dataUrl });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[avatar.upload]", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

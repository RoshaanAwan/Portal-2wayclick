import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireTenantUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";

// Accepts a single image file (multipart/form-data, field "file") and returns a
// hosted URL the caller saves to BrandingSettings.logoUrl. Mirrors the avatar
// upload route: Vercel Blob when BLOB_READ_WRITE_TOKEN is set, else an inline
// data-URL fallback so the feature works without Blob (local dev / first deploy).
// Admin-tier only — gated on can.manageBranding.

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB.
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

export async function POST(req: Request) {
  try {
    const user = await requireTenantUser();
    if (!can.manageBranding(user.role)) {
      return NextResponse.json(
        { error: "You do not have permission to manage branding." },
        { status: 403 },
      );
    }

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json(
        { error: "Use a PNG, JPEG, WebP, GIF, or SVG image." },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Image must be 4 MB or smaller." },
        { status: 400 },
      );
    }

    const ext =
      file.type === "image/svg+xml"
        ? "svg"
        : file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(`branding/logo.${ext}`, file, {
        access: "public",
        addRandomSuffix: true, // bust CDN cache on re-upload
        contentType: file.type,
      });
      await audit({
        actor: user,
        action: "branding.logo_update",
        entity: "BrandingSettings",
        entityId: user.tenantId,
        summary: `${user.name} updated the brand logo`,
        detail: { url: blob.url },
      });
      return NextResponse.json({ ok: true, url: blob.url });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const dataUrl = `data:${file.type};base64,${bytes.toString("base64")}`;
    await audit({
      actor: user,
      action: "branding.logo_update",
      entity: "BrandingSettings",
      entityId: user.tenantId,
      summary: `${user.name} updated the brand logo`,
    });
    return NextResponse.json({ ok: true, url: dataUrl });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[branding.logo.upload]", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

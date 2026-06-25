import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { DOC_CATEGORIES } from "@/lib/constants";
import {
  uploadToTenantDrive,
  DriveNotConnectedError,
  DriveError,
} from "@/lib/integrations/driveStorage";

// Uploads a document file (multipart/form-data, field "file") into the TENANT'S
// Google Drive (the company owner's connected Drive — the workspace storage
// backend) and returns the file's link + metadata. No Vercel/base64 fallback:
// if the owner hasn't connected a Drive, the upload is blocked with a clear
// message asking them to connect it.
//
// The /api/documents/create step persists the returned url/sizeKb/fileType onto
// the Document row — so a card's "Download" actually opens the file in Drive.

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB — generous for a shared doc.

// Map a file's MIME type / extension to one of the library's five type keys
// (see app/(app)/documents/fileTypes.ts). Falls back to "doc".
function detectFileType(name: string, mime: string): "pdf" | "doc" | "sheet" | "slide" | "img" {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext))
    return "img";
  if (
    mime.includes("spreadsheet") ||
    mime === "text/csv" ||
    ["xls", "xlsx", "csv", "numbers"].includes(ext)
  )
    return "sheet";
  if (
    mime.includes("presentation") ||
    ["ppt", "pptx", "key"].includes(ext)
  )
    return "slide";
  return "doc";
}

export async function POST(req: Request) {
  try {
    const user = await requireTenantUser();

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "That file is empty." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File must be 25 MB or smaller." },
        { status: 400 },
      );
    }

    const fileType = detectFileType(file.name, file.type);
    const sizeKb = Math.max(1, Math.round(file.size / 1024));

    // Route into Documents/<category> in the workspace Drive. Validate the
    // category against the known list so a crafted value can't create arbitrary
    // folders; anything unknown falls back to General.
    const rawCategory = form.get("category");
    const category =
      typeof rawCategory === "string" &&
      (DOC_CATEGORIES as readonly string[]).includes(rawCategory)
        ? rawCategory
        : "General";

    const bytes = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadToTenantDrive(
      user.tenantId,
      {
        name: file.name || "document",
        mimeType: file.type || "application/octet-stream",
        bytes,
      },
      { subfolderPath: `Documents/${category}` },
    );

    await audit({
      actor: user,
      action: "document.upload",
      entity: "Document",
      summary: `${user.name} uploaded a document file`,
      detail: { name: file.name, fileType, sizeKb, driveId: uploaded.id },
    });

    return NextResponse.json({
      ok: true,
      url: uploaded.webViewLink ?? "#",
      fileType,
      sizeKb,
      name: file.name,
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
    console.error("[documents.upload]", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

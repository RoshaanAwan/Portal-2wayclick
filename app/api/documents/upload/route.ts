import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

// Uploads a document file (multipart/form-data, field "file") to Vercel Blob and
// returns the hosted URL plus metadata derived from the file itself (type key +
// size in KB). Mirrors the avatar upload route: when BLOB_READ_WRITE_TOKEN isn't
// set (local dev), it falls back to an inline data URL so uploads still work
// end-to-end without extra setup.
//
// The /api/documents/create step persists the returned url/sizeKb/fileType onto
// the Document row — so a card's "Download" actually downloads.

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
    const user = await requireUser();

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

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      // Preserve the original filename under a per-user path; random suffix keeps
      // re-uploads of the same name from clobbering each other.
      const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "file";
      const blob = await put(`documents/${user.id}/${safeName}`, file, {
        access: "public",
        addRandomSuffix: true,
        contentType: file.type || "application/octet-stream",
      });

      await audit({
        actor: user,
        action: "document.upload",
        entity: "Document",
        summary: `${user.name} uploaded a document file`,
        detail: { name: file.name, fileType, sizeKb },
      });

      return NextResponse.json({ ok: true, url: blob.url, fileType, sizeKb, name: file.name });
    }

    // Local-dev fallback: inline data URL (works for download, stays in the row).
    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "application/octet-stream";
    const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;

    await audit({
      actor: user,
      action: "document.upload",
      entity: "Document",
      summary: `${user.name} uploaded a document file`,
      detail: { name: file.name, fileType, sizeKb },
    });

    return NextResponse.json({ ok: true, url: dataUrl, fileType, sizeKb, name: file.name });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[documents.upload]", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { requireSystemOwner } from "@/lib/auth";
import { adminDb } from "@/lib/db";
import { open } from "@/lib/cryptoBox";
import { accessTokenFromSealed, uploadFile, DriveError } from "@/lib/integrations/googleDrive";

const MAX_BYTES = 25 * 1024 * 1024;

function detectFileType(name: string, mime: string): "pdf" | "doc" | "sheet" | "slide" | "img" {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "img";
  if (mime.includes("spreadsheet") || mime === "text/csv" || ["xls", "xlsx", "csv", "numbers"].includes(ext)) return "sheet";
  if (mime.includes("presentation") || ["ppt", "pptx", "key"].includes(ext)) return "slide";
  return "doc";
}

// POST /api/system/documents/upload
// Uploads to the System Owner's Drive if connected; base64 data URL otherwise.
export async function POST(req: Request) {
  try {
    const actor = await requireSystemOwner();

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File))
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    if (file.size === 0)
      return NextResponse.json({ error: "That file is empty." }, { status: 400 });
    if (file.size > MAX_BYTES)
      return NextResponse.json({ error: "File must be 25 MB or smaller." }, { status: 400 });

    const fileType = detectFileType(file.name, file.type);
    const sizeKb = Math.max(1, Math.round(file.size / 1024));
    const bytes = Buffer.from(await file.arrayBuffer());

    // Try Drive upload if the System Owner has a connection.
    const conn = await adminDb.googleDriveConnection.findUnique({
      where: { userId: actor.id },
      select: { refreshToken: true, folderId: true },
    });

    if (conn) {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      if (clientId && clientSecret) {
        const token = await accessTokenFromSealed(
          { clientId, clientSecret },
          conn.refreshToken,
        );
        const uploaded = await uploadFile(token, {
          name: file.name || "document",
          mimeType: file.type || "application/octet-stream",
          bytes,
        }, { folderId: conn.folderId });
        return NextResponse.json({
          ok: true,
          url: uploaded.webViewLink ?? "#",
          fileType,
          sizeKb,
          name: file.name,
        });
      }
    }

    // Fallback: base64 data URL.
    const url = `data:${file.type || "application/octet-stream"};base64,${bytes.toString("base64")}`;
    return NextResponse.json({ ok: true, url, fileType, sizeKb, name: file.name });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED" || e?.message === "FORBIDDEN")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e instanceof DriveError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[system.documents.upload]", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

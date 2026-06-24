import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import {
  uploadToTenantDrive,
  DriveNotConnectedError,
  DriveError,
} from "@/lib/integrations/driveStorage";

// Uploads an expense receipt/slip (multipart/form-data, field "file") into the
// TENANT'S Google Drive (the company owner's connected Drive) and returns its
// link + name + size. Used by the expense form. No Vercel/base64 fallback: if
// the owner hasn't connected a Drive, the upload is blocked with a clear message.
//
// Admin-tier only — same gate as the rest of the finance module. The create
// step persists the returned url/name/sizeKb onto the Expense.

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — a receipt photo or PDF.

// Receipts are images or PDFs; reject anything else early.
const ALLOWED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
]);

export async function POST(req: Request) {
  try {
    const user = await requireTenantUser();
    if (!can.manageFinance(user.role)) {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }

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
        { error: "Slip must be 10 MB or smaller." },
        { status: 400 },
      );
    }
    // Allow by MIME, or by extension when the browser sends a blank type.
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const extOk = ["pdf", "jpg", "jpeg", "png", "webp", "gif", "heic"].includes(ext);
    if (file.type && !ALLOWED.has(file.type) && !extOk) {
      return NextResponse.json(
        { error: "Upload a PDF or image receipt." },
        { status: 400 },
      );
    }

    const sizeKb = Math.max(1, Math.round(file.size / 1024));

    const bytes = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadToTenantDrive(user.tenantId, {
      name: file.name || "receipt",
      mimeType: file.type || "application/octet-stream",
      bytes,
    });

    await audit({
      actor: user,
      action: "expense.create",
      entity: "Expense",
      summary: `${user.name} uploaded an expense slip`,
      detail: { name: file.name, sizeKb, driveId: uploaded.id },
    });

    return NextResponse.json({
      ok: true,
      url: uploaded.webViewLink ?? "#",
      name: file.name,
      sizeKb,
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
    console.error("[finance.upload]", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

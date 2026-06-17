import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";

// Uploads an expense receipt/slip (multipart/form-data, field "file") to Vercel
// Blob and returns the hosted URL plus name + size. Shared by the general
// expense and canteen forms. Mirrors /api/documents/upload: when
// BLOB_READ_WRITE_TOKEN isn't set (local dev) it falls back to an inline data
// URL so uploads work end-to-end with no extra setup.
//
// Admin-tier only — same gate as the rest of the finance module. The create
// steps persist the returned url/name/sizeKb onto the Expense / CanteenExpense.

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
    const user = await requireUser();
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

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "slip";
      const blob = await put(`expense-slips/${user.id}/${safeName}`, file, {
        access: "public",
        addRandomSuffix: true,
        contentType: file.type || "application/octet-stream",
      });

      await audit({
        actor: user,
        action: "expense.create",
        entity: "Expense",
        summary: `${user.name} uploaded an expense slip`,
        detail: { name: file.name, sizeKb },
      });

      return NextResponse.json({
        ok: true,
        url: blob.url,
        name: file.name,
        sizeKb,
      });
    }

    // Local-dev fallback: inline data URL.
    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "application/octet-stream";
    const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;
    return NextResponse.json({ ok: true, url: dataUrl, name: file.name, sizeKb });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[finance.upload]", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

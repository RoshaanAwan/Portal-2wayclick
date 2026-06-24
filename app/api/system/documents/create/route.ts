import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSystemOwner } from "@/lib/auth";
import { adminDb } from "@/lib/db";
import { DOC_CATEGORIES } from "@/lib/constants";

const FILE_TYPES = ["pdf", "doc", "sheet", "slide", "img"] as const;
const SAFE_URL = /^(https?:|data:)/i;

const schema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(280).optional().or(z.literal("")),
  category: z.enum(DOC_CATEGORIES).default("General"),
  fileType: z.enum(FILE_TYPES).default("pdf"),
  sizeKb: z.coerce.number().int().min(0).optional(),
  url: z
    .string()
    .trim()
    .refine((u) => u === "" || SAFE_URL.test(u), { message: "URL must be http(s) or data link" })
    .optional(),
});

// POST /api/system/documents/create — System Owner adds a platform document.
export async function POST(req: Request) {
  try {
    const actor = await requireSystemOwner();
    const data = schema.parse(await req.json());

    const doc = await adminDb.document.create({
      data: {
        tenantId: actor.tenantId,
        uploaderId: actor.id,
        title: data.title,
        description: data.description || null,
        category: data.category,
        fileType: data.fileType,
        sizeKb: data.sizeKb ?? 0,
        url: data.url && data.url.length > 0 ? data.url : "#",
      },
    });

    return NextResponse.json({ ok: true, id: doc.id });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED" || e?.message === "FORBIDDEN")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[system.documents.create]", e);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

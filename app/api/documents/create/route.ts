import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { recordActivity } from "@/lib/activityFeed";
import { DOC_CATEGORIES } from "@/lib/constants";

const FILE_TYPES = ["pdf", "doc", "sheet", "slide", "img"] as const;

const schema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  description: z.string().trim().max(280).optional().or(z.literal("")),
  category: z.enum(DOC_CATEGORIES).default("General"),
  fileType: z.enum(FILE_TYPES).default("pdf"),
  sizeKb: z.coerce.number().int().min(0).max(50_000_000).optional(),
  url: z.string().trim().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const data = schema.parse(await req.json());

    const doc = await db.document.create({
      data: {
        title: data.title,
        description: data.description ? data.description : null,
        category: data.category,
        fileType: data.fileType ?? "pdf",
        sizeKb: data.sizeKb ?? 0,
        url: data.url && data.url.length > 0 ? data.url : "#",
        uploaderId: user.id,
      },
    });

    await recordActivity({ actor: user, verb: "uploaded", target: doc.title });

    await audit({
      actor: user,
      action: "document.create",
      entity: "Document",
      entityId: doc.id,
      summary: `${user.name} added document “${doc.title}”`,
      detail: { category: doc.category, fileType: doc.fileType },
    });

    return NextResponse.json({ ok: true, id: doc.id });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

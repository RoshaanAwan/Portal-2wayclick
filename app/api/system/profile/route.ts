import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSystemOwner } from "@/lib/auth";
import { adminDb } from "@/lib/db";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
});

// POST /api/system/profile — System Owner updates their display name.
export async function POST(req: Request) {
  try {
    const actor = await requireSystemOwner();
    const { name } = schema.parse(await req.json());

    await adminDb.user.update({
      where: { id: actor.id },
      data: { name },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED" || e?.message === "FORBIDDEN")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e?.name === "ZodError")
      return NextResponse.json({ error: e.errors?.[0]?.message ?? "Invalid input" }, { status: 400 });
    console.error("[system.profile]", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

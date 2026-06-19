import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

// Active users the caller can start a conversation with (everyone but
// themselves). Since anyone can DM anyone, this is open to any authenticated
// user — it returns only safe display fields, never anything sensitive.
// Optional ?q= filters by name for the picker's search box.
export async function GET(req: Request) {
  try {
    const me = await requireUser();
    const q = new URL(req.url).searchParams.get("q")?.trim();

    const people = await db.user.findMany({
      where: {
        disabledAt: null,
        id: { not: me.id },
        ...(q
          ? { name: { contains: q, mode: "insensitive" as const } }
          : {}),
      },
      orderBy: { name: "asc" },
      take: 50,
      select: { id: true, name: true, title: true, department: true, avatarUrl: true },
    });

    return NextResponse.json({ people });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

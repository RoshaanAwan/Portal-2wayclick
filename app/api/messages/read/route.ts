import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { membershipOf } from "@/lib/messaging";

// Advance the caller's read cursor in a conversation. `upTo` is the newest
// rendered message's timestamp (defaults to now). The cursor only moves forward
// — we never un-read by passing an older timestamp — so a late mark-read from a
// stale tab can't lower the count.
const schema = z.object({
  conversationId: z.string().min(1),
  upTo: z.string().datetime().optional(),
});

export async function POST(req: Request) {
  try {
    const me = await requireUser();
    const { conversationId, upTo } = schema.parse(await req.json());

    const member = await membershipOf(conversationId, me.id);
    if (!member)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const target = upTo ? new Date(upTo) : new Date();
    // Forward-only: skip the write if our cursor is already at/past the target.
    if (member.lastReadAt >= target) {
      return NextResponse.json({ ok: true, advanced: false });
    }

    await db.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: me.id } },
      data: { lastReadAt: target },
    });
    return NextResponse.json({ ok: true, advanced: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e instanceof z.ZodError)
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { isAdminTier } from "@/lib/permissions";

// Admin-only: link (or clear) a user's Slack identity so the attendance webhook
// (POST /api/attendance/slack) can attribute Slack check-in/out events to the
// right portal account by slackUserId. See docs/slack-attendance.md.

const schema = z.object({
  userId: z.string().min(1),
  // Slack user IDs look like "U012ABCDEF" / "W…"; allow clearing with "".
  slackUserId: z
    .string()
    .trim()
    .max(40)
    .regex(/^[UW][A-Z0-9]{6,}$/i, "That doesn't look like a Slack user ID")
    .optional()
    .or(z.literal("")),
});

export async function POST(req: Request) {
  try {
    const actor = await requireUser();
    if (!isAdminTier(actor.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId, slackUserId } = schema.parse(await req.json());
    const value = slackUserId?.trim() ? slackUserId.trim() : null;

    const target = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, slackUserId: true },
    });
    if (!target) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // The slackUserId column is unique — guard against linking an ID that's
    // already attached to someone else (Prisma would throw P2002 otherwise).
    if (value && value !== target.slackUserId) {
      const clash = await db.user.findFirst({
        where: { slackUserId: value, NOT: { id: userId } },
        select: { name: true },
      });
      if (clash) {
        return NextResponse.json(
          { error: `That Slack ID is already linked to ${clash.name}` },
          { status: 409 },
        );
      }
    }

    await db.user.update({
      where: { id: userId },
      data: { slackUserId: value },
    });

    await audit({
      actor,
      action: "user.profile_update",
      entity: "User",
      entityId: target.id,
      targetUserId: target.id,
      summary: `${actor.name} ${value ? "linked" : "cleared"} ${target.name}'s Slack ID`,
      detail: { field: "slackUserId", set: !!value },
    });

    return NextResponse.json({ ok: true, slackUserId: value });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e?.name === "ZodError") {
      return NextResponse.json(
        { error: e.errors?.[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    console.error("[admin.users.slack]", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

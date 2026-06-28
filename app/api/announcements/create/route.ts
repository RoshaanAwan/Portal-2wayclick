import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyMany } from "@/lib/notifications";
import { recordActivity } from "@/lib/activityFeed";
import { can, isAdminTier } from "@/lib/permissions";
import { notifySlackChannel } from "@/lib/integrations/slack";
import { z } from "zod";
import { ANNOUNCEMENT_CATEGORIES } from "@/lib/constants";

const COVER_BY_CATEGORY: Record<string, string> = {
  General: "pink",
  Product: "accent",
  People: "emerald",
  Policy: "cyan",
  Event: "cyan",
};

const schema = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(1).max(4000),
  category: z.enum(ANNOUNCEMENT_CATEGORIES),
  pinned: z.boolean().optional().default(false),
});

export async function POST(req: Request) {
  try {
    const user = await requireTenantUser();

    // Only elevated staff may post announcements.
    if (!can.postAnnouncements(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { title, body, category, pinned } = schema.parse(await req.json());

    const announcement = await db.announcement.create({
      data: {
        tenantId: user.tenantId,
        title,
        body,
        category,
        pinned,
        coverColor: COVER_BY_CATEGORY[category] ?? "accent",
        authorId: user.id,
      },
    });

    await recordActivity({ actor: user, verb: "posted", target: title });

    await audit({
      actor: user,
      action: "announcement.create",
      entity: "Announcement",
      entityId: announcement.id,
      summary: `${user.name} posted “${title}”`,
      detail: { category, pinned },
    });

    // Notify the whole company (the author is dropped by notify()'s self-check).
    const everyone = await db.user.findMany({ select: { id: true } });
    await notifyMany(
      everyone.map((u) => u.id),
      {
        type: "announcement.created",
        message: `posted “${title}”`,
        link: "/announcements",
        actor: user,
      },
    );

    // Mirror admin-tier announcements (Company Owner / Admin / HR) to the tenant's
    // configured Slack channel — so company-wide notices like holidays reach Slack
    // too. Best-effort; notifySlackChannel never throws and no-ops when Slack is
    // off/disconnected or no notify channel is set. LEAD/PM posts stay portal-only.
    if (isAdminTier(user.role)) {
      await notifySlackChannel(
        user.tenantId,
        `*${title}* — ${category}\n${body}\n_Posted by ${user.name}_`,
      );
    }

    return NextResponse.json({ ok: true, id: announcement.id });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

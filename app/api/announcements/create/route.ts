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
  // Optional calendar date (YYYY-MM-DD) to pin this post to — used when posting
  // from the dashboard Calendar (a holiday/event on a specific day). Stored at
  // UTC midnight so it reads as that calendar date regardless of server TZ.
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
    .optional()
    .nullable(),
});

export async function POST(req: Request) {
  try {
    const user = await requireTenantUser();

    // Only elevated staff may post announcements.
    if (!can.postAnnouncements(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { title, body, category, pinned, eventDate } = schema.parse(
      await req.json(),
    );

    // Anchor a calendar date at UTC midnight so it groups by the chosen day. A
    // holiday is an Event-category post with a date — it's surfaced on the
    // calendar and (below) named in the Slack mirror.
    const eventAt = eventDate ? new Date(`${eventDate}T00:00:00.000Z`) : null;
    const isHoliday = category === "Event" && !!eventAt;

    const announcement = await db.announcement.create({
      data: {
        tenantId: user.tenantId,
        title,
        body,
        category,
        pinned,
        eventDate: eventAt,
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
      // A holiday (Event + date) gets a calendar-flavored line that names the
      // date and the announcer, per the requirement that holidays reach Slack
      // "with the person name". Everything else uses the standard mirror.
      const slackText = isHoliday
        ? `:palm_tree: *Holiday — ${title}*\n${eventAt!.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}\n${body}\n_Announced by ${user.name}_`
        : `*${title}* — ${category}\n${body}\n_Posted by ${user.name}_`;
      await notifySlackChannel(user.tenantId, slackText);
    }

    return NextResponse.json({ ok: true, id: announcement.id });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

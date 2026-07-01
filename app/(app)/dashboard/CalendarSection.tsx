import { db } from "@/lib/db";
import type { SafeUser } from "@/lib/auth";
import { isAdminTier } from "@/lib/permissions";
import { issueKey } from "@/lib/issues";
import { getSlackConnection, isIntegrationEnabled } from "@/lib/integrationsServer";
import { listChannels } from "@/lib/integrations/slack";
import { DashboardCalendar, type CalendarEvent, type SlackChannelOption } from "./DashboardCalendar";

// ── Dashboard Calendar (replaces the Pulse feed) ─────────────────────────────
// A month calendar that overlays two streams onto each day:
//   • Task due dates — board cards with a dueDate, each tagged with who added
//     (created) it, and
//   • Announcements/holidays — Announcement rows with an eventDate, posted from
//     the calendar's "Announce" action (Admin-tier only).
//
// Role-based visibility of task due dates:
//   • Admin tier (Super Admin / Admin / HR) sees every card's due date.
//   • Everyone else sees only cards they created or are assigned to — a card one
//     person added is not shown to unrelated colleagues.
// Announcements/holidays are company-wide broadcasts, so they're shown to all.
//
// Admin-tier users get the "Announce" button (the client renders it), which
// posts to /api/announcements/create with an eventDate; holidays (category
// "Event") additionally mirror to Slack with the announcer's name. See that
// route and [[slack-integration]].
//
// Tenancy: `db` is the SCOPED client, so both reads stay within the tenant.

/** UTC-midnight anchor of a date's calendar day (matches the announce route). */
function dayKeyUTC(d: Date): string {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);
}

export async function CalendarSection({ user }: { user: SafeUser }) {
  const isAdmin = isAdminTier(user.role);

  // Window: the current month plus a generous pad on each side so the grid's
  // leading/trailing days (from neighbouring months) still carry their dots.
  const now = new Date();
  const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const windowEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0, 23, 59, 59));

  // Non-admins only see cards they created or are assigned to; admins see all.
  const visibilityWhere = isAdmin
    ? {}
    : {
        OR: [
          { creatorId: user.id },
          { assignees: { some: { userId: user.id } } },
        ],
      };

  const [tasks, events] = await Promise.all([
    db.task.findMany({
      where: {
        dueDate: { gte: windowStart, lte: windowEnd },
        ...visibilityWhere,
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        status: true,
        issueNumber: true,
        list: { select: { board: { select: { keyPrefix: true } } } },
        creator: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: "asc" },
    }),
    db.announcement.findMany({
      where: { eventDate: { gte: windowStart, lte: windowEnd } },
      select: {
        id: true,
        title: true,
        category: true,
        eventDate: true,
        author: { select: { name: true } },
        authorName: true,
      },
      orderBy: { eventDate: "asc" },
    }),
  ]);

  const items: CalendarEvent[] = [
    ...events.map((e) => ({
      id: `ann-${e.id}`,
      day: dayKeyUTC(e.eventDate!),
      title: e.title,
      kind: (e.category === "Event" ? "holiday" : "announcement") as
        | "holiday"
        | "announcement",
      // Who posted it (the announcer).
      author: e.author?.name ?? e.authorName ?? null,
    })),
    ...tasks.map((t) => ({
      id: `task-${t.id}`,
      day: dayKeyUTC(t.dueDate!),
      title: t.title,
      kind: "task" as const,
      // Display the human key (e.g. PORTAL-42); deep-link by raw id (the
      // /tasks/[key] route resolves either form).
      meta: issueKey(t.list.board.keyPrefix, t.issueNumber),
      // Who added the card. "You" reads nicer for one's own; admins see the
      // real name so they know who owns it.
      author:
        t.creator.id === user.id && !isAdmin ? "You" : t.creator.name,
      linkTo: `/tasks/${t.id}`,
      done: t.status === "DONE",
    })),
  ];

  // Admins get a Slack channel picker in the announce modal so a holiday can be
  // routed to a specific channel (not just the tenant default). Best-effort: any
  // Slack hiccup (off, disconnected, revoked token) just yields no picker — the
  // holiday still posts and falls back to the default channel server-side.
  let slack: {
    channels: SlackChannelOption[];
    defaultChannelId: string | null;
  } | null = null;
  if (isAdmin) {
    try {
      const enabled = await isIntegrationEnabled("slack");
      if (enabled) {
        const conn = await getSlackConnection();
        if (conn) {
          const channels = await listChannels(conn.botToken);
          slack = {
            channels: channels.map((c) => ({ id: c.id, name: c.name })),
            defaultChannelId: conn.notifyChannelId,
          };
        }
      }
    } catch {
      // Slack unreachable / token revoked — skip the picker silently.
      slack = null;
    }
  }

  return (
    <DashboardCalendar events={items} canAnnounce={isAdmin} slack={slack} />
  );
}

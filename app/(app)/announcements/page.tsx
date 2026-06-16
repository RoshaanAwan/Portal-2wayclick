import { Megaphone } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { AnnouncementsClient, type AnnouncementDTO } from "./AnnouncementsClient";

// Comments are capped to the most recent MAX_COMMENTS per card — enough for the
// thread view, without loading an unbounded history for every post on a single
// page load. PAGE_SIZE bounds how many announcements load per page.
const PAGE_SIZE = 12;
const MAX_COMMENTS = 30;

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; category?: string }>;
}) {
  const user = await getCurrentUser();

  const sp = await searchParams;
  const category =
    sp.category && sp.category !== "All" ? sp.category : null;
  const where = category ? { category } : undefined;

  const total = await db.announcement.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requested = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 1), pageCount)
    : 1;

  const announcements = await db.announcement.findMany({
    where,
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      author: {
        select: { id: true, name: true, title: true, avatarUrl: true },
      },
      reactions: {
        select: { id: true, emoji: true, userId: true },
      },
      reads: { select: { userId: true } },
      comments: {
        // Newest-first in the DB so `take` keeps the most recent; reversed below
        // for the oldest-first display order the card expects.
        orderBy: { createdAt: "desc" },
        take: MAX_COMMENTS,
        include: {
          author: { select: { id: true, name: true, avatarUrl: true } },
        },
      },
      _count: { select: { comments: true, reactions: true } },
    },
  });

  // Serialize to plain DTOs for the client tree.
  const data: AnnouncementDTO[] = announcements.map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    category: a.category,
    pinned: a.pinned,
    coverColor: a.coverColor,
    createdAt: a.createdAt.toISOString(),
    author: {
      id: a.author.id,
      name: a.author.name,
      title: a.author.title,
      avatarUrl: a.author.avatarUrl,
    },
    reactions: a.reactions.map((r) => ({
      id: r.id,
      emoji: r.emoji,
      userId: r.userId,
    })),
    readCount: a.reads.length,
    commentCount: a._count.comments,
    reactionCount: a._count.reactions,
    // Fetched newest-first (so `take` keeps the latest); reverse for the
    // oldest-first thread order the card renders.
    comments: a.comments
      .slice()
      .reverse()
      .map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.createdAt.toISOString(),
        author: {
          id: c.author.id,
          name: c.author.name,
          avatarUrl: c.author.avatarUrl,
        },
      })),
  }));

  const canPost = can.postAnnouncements(user?.role);
  const canManage = can.manageAnnouncements(user?.role);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        icon={Megaphone}
        title="Announcements"
        subtitle="Company-wide news, updates, and moments worth sharing."
      />
      <AnnouncementsClient
        announcements={data}
        currentUser={
          user
            ? {
                id: user.id,
                name: user.name,
                role: user.role,
                avatarUrl: user.avatarUrl,
              }
            : null
        }
        canPost={canPost}
        canManage={canManage}
        page={page}
        pageCount={pageCount}
        category={category ?? "All"}
      />
    </div>
  );
}

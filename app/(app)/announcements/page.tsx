import { Megaphone } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { AnnouncementsClient, type AnnouncementDTO } from "./AnnouncementsClient";

export default async function AnnouncementsPage() {
  const user = await getCurrentUser();

  const announcements = await db.announcement.findMany({
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    include: {
      author: {
        select: { id: true, name: true, title: true, avatarUrl: true },
      },
      reactions: {
        select: { id: true, emoji: true, userId: true },
      },
      reads: { select: { userId: true } },
      comments: {
        orderBy: { createdAt: "asc" },
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
    comments: a.comments.map((c) => ({
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
      />
    </div>
  );
}

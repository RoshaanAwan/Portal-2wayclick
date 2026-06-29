import { db } from "@/lib/db";
import { RightRail } from "./RightRail";
import type { SafeUser } from "@/lib/auth";

export async function RightRailSection({
  user,
  canSeeDirectory,
}: {
  user: SafeUser;
  canSeeDirectory: boolean;
}) {
  const [pinned, teammates] = await Promise.all([
    db.announcement.findMany({
      where: { pinned: true },
      orderBy: { createdAt: "desc" },
      take: 2,
      // author is null for System Owner posts (name lives in authorName).
      include: { author: { select: { name: true } } },
    }),
    db.user.findMany({
      where: { department: user.department, id: { not: user.id } },
      orderBy: { name: "asc" },
      take: 6,
    }),
  ]);

  const pinnedCards = pinned.map((p) => ({
    id: p.id,
    title: p.title,
    body: p.body,
    category: p.category,
    coverColor: p.coverColor,
    createdAt: p.createdAt.toISOString(),
    authorName: p.author?.name ?? p.authorName ?? "System",
  }));

  const team = teammates.map((t) => ({
    id: t.id,
    name: t.name,
    title: t.title,
    avatarUrl: t.avatarUrl,
  }));

  return (
    <RightRail
      pinned={pinnedCards}
      team={team}
      department={user.department}
      canSeeDirectory={canSeeDirectory}
    />
  );
}

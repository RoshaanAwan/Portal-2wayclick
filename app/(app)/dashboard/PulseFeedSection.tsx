import { db } from "@/lib/db";
import { PulseFeed } from "./PulseFeed";

export async function PulseFeedSection() {
  const activities = await db.activity.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    // Only the fields the feed renders — avoids shipping passwordHash & co.
    include: {
      user: { select: { name: true, avatarUrl: true, title: true } },
    },
  });

  const feed = activities.map((a) => ({
    id: a.id,
    verb: a.verb,
    target: a.target,
    createdAt: a.createdAt.toISOString(),
    user: {
      name: a.user.name,
      avatarUrl: a.user.avatarUrl,
      title: a.user.title,
    },
  }));

  return <PulseFeed items={feed} />;
}

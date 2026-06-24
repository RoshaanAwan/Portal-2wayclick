import { db } from "@/lib/db";
import { StatTiles } from "./StatTiles";

export async function StatTilesSection({
  canSeeDirectory,
}: {
  canSeeDirectory: boolean;
}) {
  const [userCount, openAnnouncements, pendingLeave, documentCount] =
    await Promise.all([
      db.user.count(),
      db.announcement.count(),
      db.leaveRequest.count({ where: { status: "PENDING" } }),
      db.document.count(),
    ]);

  return (
    <StatTiles
      stats={{ userCount, openAnnouncements, pendingLeave, documentCount }}
      canSeeDirectory={canSeeDirectory}
    />
  );
}

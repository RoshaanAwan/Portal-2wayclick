import { db } from "@/lib/db";
import { DONE_LIST_KEYWORDS } from "@/lib/teamPulse";
import { Hero } from "./Hero";
import type { SafeUser } from "@/lib/auth";

export async function HeroSection({ user }: { user: SafeUser }) {
  const now = new Date();

  const [userCount, outTodayCount, openTaskCount] = await Promise.all([
    db.user.count(),
    // How many people are on approved leave covering today (live hero stat).
    db.leaveRequest.count({
      where: {
        status: "APPROVED",
        startDate: { lte: now },
        endDate: { gte: now },
      },
    }),
    // Open tasks across the org — anything not parked in a Done/Archived-style
    // list. Mirrors Team Pulse's "open" notion (kept simple for a headline stat).
    db.task.count({
      where: {
        NOT: {
          OR: DONE_LIST_KEYWORDS.map((k) => ({
            list: { name: { contains: k, mode: "insensitive" as const } },
          })),
        },
      },
    }),
  ]);

  // "Available now" = everyone not on leave today. Snapshot for the hero pills.
  const todayStats = {
    availableNow: Math.max(0, userCount - outTodayCount),
    outToday: outTodayCount,
    openTasks: openTaskCount,
  };

  return (
    <Hero
      firstName={user.name.split(" ")[0]}
      name={user.name}
      title={user.title}
      department={user.department}
      avatarUrl={user.avatarUrl}
      todayStats={todayStats}
    />
  );
}

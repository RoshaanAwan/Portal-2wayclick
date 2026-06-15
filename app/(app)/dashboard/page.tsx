import { getCurrentUser } from "@/lib/auth";
import { isAdminTier } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Hero } from "./Hero";
import { StatTiles } from "./StatTiles";
import { PulseFeed } from "./PulseFeed";
import { RightRail } from "./RightRail";
import { HeadcountChart } from "./HeadcountChart";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Directory is admin tier only — drives whether we surface links to it.
  const canSeeDirectory = isAdminTier(user.role);

  const now = new Date();

  // Fetch everything in parallel — this is the landing page, keep it snappy.
  const [
    userCount,
    openAnnouncements,
    pendingLeave,
    documentCount,
    activities,
    pinned,
    teammates,
    deptGroups,
    outTodayCount,
    openTaskCount,
  ] = await Promise.all([
    db.user.count(),
    db.announcement.count(),
    db.leaveRequest.count({ where: { status: "PENDING" } }),
    db.document.count(),
    db.activity.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: true },
    }),
    db.announcement.findMany({
      where: { pinned: true },
      orderBy: { createdAt: "desc" },
      take: 2,
      include: { author: true },
    }),
    db.user.findMany({
      where: { department: user.department, id: { not: user.id } },
      orderBy: { name: "asc" },
      take: 6,
    }),
    db.user.groupBy({
      by: ["department"],
      _count: { _all: true },
    }),
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
          OR: [
            { list: { name: { contains: "done", mode: "insensitive" } } },
            { list: { name: { contains: "complete", mode: "insensitive" } } },
            { list: { name: { contains: "archiv", mode: "insensitive" } } },
            { list: { name: { contains: "shipped", mode: "insensitive" } } },
            { list: { name: { contains: "closed", mode: "insensitive" } } },
          ],
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

  const stats = {
    userCount,
    openAnnouncements,
    pendingLeave,
    documentCount,
  };

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

  const pinnedCards = pinned.map((p) => ({
    id: p.id,
    title: p.title,
    body: p.body,
    category: p.category,
    coverColor: p.coverColor,
    createdAt: p.createdAt.toISOString(),
    authorName: p.author.name,
  }));

  const team = teammates.map((t) => ({
    id: t.id,
    name: t.name,
    title: t.title,
    avatarUrl: t.avatarUrl,
  }));

  const headcount = deptGroups
    .map((g) => ({ department: g.department, count: g._count._all }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Hero
        firstName={user.name.split(" ")[0]}
        name={user.name}
        title={user.title}
        department={user.department}
        avatarUrl={user.avatarUrl}
        todayStats={todayStats}
      />

      <StatTiles stats={stats} canSeeDirectory={canSeeDirectory} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-6 lg:col-span-2">
          <PulseFeed items={feed} />
          <HeadcountChart data={headcount} total={userCount} />
        </div>

        {/* Right rail */}
        <div className="lg:col-span-1">
          <RightRail
            pinned={pinnedCards}
            team={team}
            department={user.department}
            canSeeDirectory={canSeeDirectory}
          />
        </div>
      </div>
    </div>
  );
}

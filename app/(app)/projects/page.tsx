import { FolderKanban } from "lucide-react";
import { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { ProjectsClient, type ProjectDTO, type MemberDTO } from "./ProjectsClient";

const PAGE_SIZE = 12;

type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE" | "COMPLETED";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; q?: string }>;
}) {
  // ── TEMP perf instrumentation ──────────────────────────────────────────────
  // Logs the wall-clock of each phase of this RSC render to the server console
  // (pm2/journalctl on the droplet) so we can pinpoint where the ~21s goes.
  // Remove once the slow phase is identified.
  const t0 = performance.now();
  const lap = (label: string, since: number) =>
    console.log(`[projects-perf] ${label}: ${(performance.now() - since).toFixed(0)}ms`);

  let mark = performance.now();
  const user = await getCurrentUser();
  lap("getCurrentUser", mark);
  const isAdmin = can.manageProjects(user?.role);

  // Admins see every project; everyone else sees only projects they belong to.
  const baseWhere = isAdmin
    ? {}
    : { members: { some: { userId: user?.id ?? "" } } };

  const sp = await searchParams;

  // Status filter (URL-driven; defaults to all). Completed is an independent
  // axis from active/inactive: Active/Inactive exclude completed projects.
  const status: StatusFilter =
    sp.status === "ACTIVE" ||
    sp.status === "INACTIVE" ||
    sp.status === "COMPLETED"
      ? sp.status
      : "ALL";

  // Name search (URL-driven, case-insensitive contains).
  const q = (sp.q ?? "").trim();
  const searchWhere = q
    ? { name: { contains: q, mode: "insensitive" as const } }
    : {};

  // Translate a status tab into a Prisma filter. Active/Inactive deliberately
  // exclude completed projects so the three live tabs don't overlap.
  function statusWhere(s: StatusFilter) {
    switch (s) {
      case "ACTIVE":
        return { active: true, completedAt: null };
      case "INACTIVE":
        return { active: false, completedAt: null };
      case "COMPLETED":
        return { completedAt: { not: null } };
      default:
        return {};
    }
  }

  const where = { ...baseWhere, ...searchWhere, ...statusWhere(status) };

  // Per-status counts for the filter pills (scoped to what the user can see and
  // to the current search term, so the counts match the visible results).
  const countBase = { ...baseWhere, ...searchWhere };
  mark = performance.now();
  const [allCount, activeCount, inactiveCount, completedCount] =
    await Promise.all([
      db.project.count({ where: { ...countBase, ...statusWhere("ALL") } }),
      db.project.count({ where: { ...countBase, ...statusWhere("ACTIVE") } }),
      db.project.count({ where: { ...countBase, ...statusWhere("INACTIVE") } }),
      db.project.count({ where: { ...countBase, ...statusWhere("COMPLETED") } }),
    ]);
  lap("status counts (4x parallel)", mark);
  const statusCounts = {
    ALL: allCount,
    ACTIVE: activeCount,
    INACTIVE: inactiveCount,
    COMPLETED: completedCount,
  };

  mark = performance.now();
  const total = await db.project.count({ where });
  lap("total count", mark);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requested = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 1), pageCount)
    : 1;

  mark = performance.now();
  const projects = await db.project.findMany({
    orderBy: { createdAt: "desc" },
    where,
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      owner: { select: { id: true, name: true, avatarUrl: true } },
      members: {
        include: {
          user: {
            select: { id: true, name: true, avatarUrl: true, title: true },
          },
        },
      },
      // List count comes from the board's own _count (one cheap subquery).
      // Task ("card") counts are fetched separately via a single grouped
      // aggregate below instead of pulling every list row into Node — much
      // lighter on a memory-constrained box.
      board: {
        select: {
          id: true,
          _count: { select: { lists: true } },
        },
      },
    },
  });

  lap("projects findMany (+board/members/owner)", mark);

  // Per-board card (task) totals in ONE aggregate query, scoped to just the
  // boards on this page. Replaces the previous board.lists fan-out that loaded
  // every list row into Node only to sum their task counts. A single grouped
  // join (task → list) returns one count row per board — almost no memory.
  mark = performance.now();
  const boardIds = projects.map((p) => p.board.id);
  const cardCountByBoard = new Map<string, number>();
  if (boardIds.length) {
    const rows = await db.$queryRaw<{ boardId: string; count: bigint }[]>`
      SELECT l."boardId" AS "boardId", COUNT(t.id) AS count
      FROM "BoardList" l
      LEFT JOIN "Task" t ON t."listId" = l.id
      WHERE l."boardId" IN (${Prisma.join(boardIds)})
      GROUP BY l."boardId"
    `;
    for (const r of rows) {
      cardCountByBoard.set(r.boardId, Number(r.count));
    }
  }
  lap("card counts (single grouped join)", mark);

  // Full roster — admins use it for the member picker when creating projects.
  mark = performance.now();
  const roster = await db.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, avatarUrl: true, title: true },
  });
  lap("roster findMany", mark);
  lap("TOTAL render", t0);

  const projectDTOs: ProjectDTO[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    active: p.active,
    completedAt: p.completedAt ? p.completedAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    owner: {
      id: p.owner.id,
      name: p.owner.name,
      avatarUrl: p.owner.avatarUrl,
    },
    listCount: p.board._count.lists,
    cardCount: cardCountByBoard.get(p.board.id) ?? 0,
    members: p.members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      avatarUrl: m.user.avatarUrl,
      title: m.user.title,
    })),
  }));

  const rosterDTOs: MemberDTO[] = roster.map((m) => ({
    id: m.id,
    name: m.name,
    avatarUrl: m.avatarUrl,
    title: m.title,
  }));

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        icon={FolderKanban}
        title="Projects"
        subtitle="Each project has its own team and a dedicated Trello board."
      />
      <ProjectsClient
        projects={projectDTOs}
        roster={rosterDTOs}
        isAdmin={isAdmin}
        status={status}
        statusCounts={statusCounts}
        query={q}
        page={page}
        pageCount={pageCount}
      />
    </div>
  );
}

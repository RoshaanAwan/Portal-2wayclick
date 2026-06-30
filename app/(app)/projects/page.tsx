import { FolderKanban } from "lucide-react";
import { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { ProjectsClient, type ProjectDTO } from "./ProjectsClient";

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
  // ONE round-trip via groupBy: bucket the user-visible, search-matched projects
  // by their (active, isCompleted) status and derive every pill count + the
  // current tab's total in JS — replacing the previous 5 separate COUNT queries
  // (4 pills + 1 total) that serialized round-trips and pressured the heap on the
  // tight box. A project is COMPLETED iff completedAt is set; otherwise it counts
  // as ACTIVE/INACTIVE per `active`.
  const countBase = { ...baseWhere, ...searchWhere };

  // Run the status-count groupBy and the first-page project fetch in parallel —
  // they're independent queries and both benefit from the new composite index.
  const requested = Number.parseInt(sp.page ?? "1", 10);
  const safePage = Number.isFinite(requested) ? Math.max(requested, 1) : 1;

  // Query directly within the live request scope (no unstable_cache) so the
  // scoped `db` client resolves the tenant from the request context the same way
  // every other page does. The status-count groupBy and the first-page fetch are
  // independent, so run them in parallel.
  // Projects are ordered by THIS user's personal drag-and-drop order
  // (ProjectOrder) first, then newest-first for any projects they've never
  // positioned. Because the sort key lives in a per-user relation, Prisma can't
  // order by it directly — so we first fetch the matching projects' ids with
  // their createdAt and this user's sortOrder (a light id-only query), sort and
  // paginate that list in JS, then hydrate the full records for just the page.
  const userId = user?.id ?? "";
  mark = performance.now();
  const [grouped, ordered] = await Promise.all([
    db.project.groupBy({
      by: ["active", "completedAt"],
      where: countBase,
      _count: { _all: true },
    }),
    db.project.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        orders: { where: { userId }, select: { sortOrder: true } },
      },
    }),
  ]);

  // Sort: positioned projects (have a ProjectOrder row for this user) first by
  // sortOrder asc; the rest after, newest-first. Stable + deterministic.
  const ranked = ordered
    .map((p) => ({
      id: p.id,
      createdAt: p.createdAt,
      sortOrder: p.orders[0]?.sortOrder ?? null,
    }))
    .sort((a, b) => {
      const ao = a.sortOrder;
      const bo = b.sortOrder;
      if (ao !== null && bo !== null) return ao - bo;
      if (ao !== null) return -1; // positioned items lead unpositioned
      if (bo !== null) return 1;
      // Both unpositioned → newest first.
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

  // Slice the current page out of the fully-ordered id list, then hydrate.
  const pageIds = ranked
    .slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
    .map((p) => p.id);

  const hydrated = pageIds.length
    ? await db.project.findMany({
        where: { id: { in: pageIds } },
        include: {
          owner: { select: { id: true, name: true, avatarUrl: true } },
          projectLead: { select: { id: true, name: true, avatarUrl: true } },
          techLead: { select: { id: true, name: true, avatarUrl: true } },
          _count: { select: { members: true } },
          members: {
            take: 5,
            include: {
              user: {
                select: { id: true, name: true, avatarUrl: true, title: true },
              },
            },
          },
          board: {
            select: {
              id: true,
              _count: { select: { lists: true } },
            },
          },
        },
      })
    : [];

  // Re-apply the page order (the `in` fetch doesn't preserve it).
  const byId = new Map(hydrated.map((p) => [p.id, p]));
  const projects = pageIds
    .map((id) => byId.get(id))
    .filter((p): p is (typeof hydrated)[number] => p != null);

  lap("groupBy + ordered ids + hydrate", mark);

  let activeCount = 0;
  let inactiveCount = 0;
  let completedCount = 0;
  for (const g of grouped) {
    const n = g._count._all;
    if (g.completedAt !== null) completedCount += n;
    else if (g.active) activeCount += n;
    else inactiveCount += n;
  }
  const allCount = activeCount + inactiveCount + completedCount;
  const statusCounts = {
    ALL: allCount,
    ACTIVE: activeCount,
    INACTIVE: inactiveCount,
    COMPLETED: completedCount,
  };

  const total =
    status === "ACTIVE"
      ? activeCount
      : status === "INACTIVE"
        ? inactiveCount
        : status === "COMPLETED"
          ? completedCount
          : allCount;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(safePage, pageCount);

  // Card counts — one raw aggregate, scoped to just the boards on this page.
  mark = performance.now();
  const boardIds = projects.map((p) => p.board.id);
  const cardCountByBoard = new Map<string, number>();

  const cardCountRows = boardIds.length
    ? await db.$queryRaw<{ boardId: string; count: bigint }[]>`
        SELECT l."boardId" AS "boardId", COUNT(t.id) AS count
        FROM "BoardList" l
        LEFT JOIN "Task" t ON t."listId" = l.id
        WHERE l."boardId" IN (${Prisma.join(boardIds)})
        GROUP BY l."boardId"
      `
    : [];

  for (const r of cardCountRows) {
    cardCountByBoard.set(r.boardId, Number(r.count));
  }
  lap("card counts", mark);
  lap("TOTAL render", t0);

  const projectDTOs: ProjectDTO[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    // The card only shows a 2-line clamp, so cap the blurb server-side. This
    // bounds the list payload — a tenant with very long descriptions can't
    // bloat the RSC stream (the full text lives on the project detail page).
    description: p.description ? p.description.slice(0, 160) : null,
    active: p.active,
    completedAt: p.completedAt ? p.completedAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
    owner: {
      id: p.owner.id,
      name: p.owner.name,
      avatarUrl: p.owner.avatarUrl,
    },
    projectLead: p.projectLead
      ? { id: p.projectLead.id, name: p.projectLead.name, avatarUrl: p.projectLead.avatarUrl }
      : null,
    techLead: p.techLead
      ? { id: p.techLead.id, name: p.techLead.name, avatarUrl: p.techLead.avatarUrl }
      : null,
    listCount: p.board._count.lists,
    cardCount: cardCountByBoard.get(p.board.id) ?? 0,
    memberCount: p._count.members,
    members: p.members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      avatarUrl: m.user.avatarUrl,
      title: m.user.title,
    })),
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

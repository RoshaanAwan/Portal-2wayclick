import { FolderKanban } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { ProjectsClient, type ProjectDTO, type MemberDTO } from "./ProjectsClient";

const PAGE_SIZE = 12;

type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const user = await getCurrentUser();
  const isAdmin = can.manageProjects(user?.role);

  // Admins see every project; everyone else sees only projects they belong to.
  const baseWhere = isAdmin
    ? {}
    : { members: { some: { userId: user?.id ?? "" } } };

  const sp = await searchParams;

  // Active/inactive status filter (URL-driven; defaults to all).
  const status: StatusFilter =
    sp.status === "ACTIVE" || sp.status === "INACTIVE" ? sp.status : "ALL";
  const where = {
    ...baseWhere,
    ...(status === "ALL" ? {} : { active: status === "ACTIVE" }),
  };

  // Per-status counts for the filter pills (scoped to what the user can see).
  const [activeCount, inactiveCount] = await Promise.all([
    db.project.count({ where: { ...baseWhere, active: true } }),
    db.project.count({ where: { ...baseWhere, active: false } }),
  ]);
  const statusCounts = {
    ALL: activeCount + inactiveCount,
    ACTIVE: activeCount,
    INACTIVE: inactiveCount,
  };

  const total = await db.project.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requested = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 1), pageCount)
    : 1;

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
      board: {
        select: {
          id: true,
          _count: { select: { lists: true } },
          lists: { select: { _count: { select: { tasks: true } } } },
        },
      },
    },
  });

  // Full roster — admins use it for the member picker when creating projects.
  const roster = await db.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, avatarUrl: true, title: true },
  });

  const projectDTOs: ProjectDTO[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    active: p.active,
    createdAt: p.createdAt.toISOString(),
    owner: {
      id: p.owner.id,
      name: p.owner.name,
      avatarUrl: p.owner.avatarUrl,
    },
    listCount: p.board._count.lists,
    cardCount: p.board.lists.reduce((n, l) => n + l._count.tasks, 0),
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
        page={page}
        pageCount={pageCount}
      />
    </div>
  );
}

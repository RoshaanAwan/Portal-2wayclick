import { FolderKanban } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { ProjectsClient, type ProjectDTO, type MemberDTO } from "./ProjectsClient";

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  const isAdmin = can.manageProjects(user?.role);

  // Admins see every project; everyone else sees only projects they belong to.
  const projects = await db.project.findMany({
    orderBy: { createdAt: "desc" },
    where: isAdmin
      ? undefined
      : { members: { some: { userId: user?.id ?? "" } } },
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
      />
    </div>
  );
}

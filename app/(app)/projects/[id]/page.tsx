import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { ArrowLeft, KanbanSquare, Users } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, isManagerTier } from "@/lib/permissions";
import { shareUrl } from "@/lib/share";
import { PageHeader } from "@/components/ui/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { issueKey } from "@/lib/issues";
import {
  BoardClient,
  type ListDTO,
  type MemberDTO,
  type SprintDTO,
  type IssueLinkDTO,
} from "../../tasks/BoardClient";
import { AddList } from "./AddList";
import { ShareLinkPanel } from "./ShareLinkPanel";

export default async function ProjectBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  const isAdmin = can.manageProjects(user?.role);

  // Cap comments loaded per card on the initial board render (mirrors the /tasks
  // page). Without this, a card with a long thread loads its entire history on
  // every board view; the modal can lazy-load older comments on demand.
  const MAX_COMMENTS = 50;

  const project = await db.project.findUnique({
    where: { id },
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
        include: {
          sprints: { orderBy: [{ status: "asc" }, { position: "asc" }] },
          lists: {
            orderBy: { position: "asc" },
            include: {
              tasks: {
                orderBy: { position: "asc" },
                include: {
                  creator: {
                    select: { id: true, name: true, avatarUrl: true },
                  },
                  reporter: {
                    select: { id: true, name: true, avatarUrl: true },
                  },
                  assignees: {
                    include: {
                      user: {
                        select: {
                          id: true,
                          name: true,
                          avatarUrl: true,
                          title: true,
                        },
                      },
                    },
                  },
                  comments: {
                    // Newest-first so `take` keeps the most recent; reversed in
                    // the map below for the oldest-first order the modal expects.
                    orderBy: { createdAt: "desc" },
                    take: MAX_COMMENTS,
                    include: {
                      author: {
                        select: { id: true, name: true, avatarUrl: true },
                      },
                    },
                  },
                  outgoingLinks: {
                    include: {
                      target: {
                        select: { id: true, title: true, status: true, issueType: true, issueNumber: true },
                      },
                    },
                  },
                  incomingLinks: {
                    include: {
                      source: {
                        select: { id: true, title: true, status: true, issueType: true, issueNumber: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!project) notFound();

  // Access control: admins see every project; others only their own.
  const isMember = project.members.some((m) => m.userId === user?.id);
  if (!isAdmin && !isMember) notFound();

  const keyPrefix = project.board.keyPrefix;

  const lists: ListDTO[] = project.board.lists.map((list) => ({
    id: list.id,
    name: list.name,
    position: list.position,
    tasks: list.tasks.map((t) => {
      const links: IssueLinkDTO[] = [
        ...t.outgoingLinks.map((l) => ({
          id: l.id,
          type: l.type,
          direction: "outward" as const,
          issueKey: issueKey(keyPrefix, l.target.issueNumber),
          taskId: l.target.id,
          title: l.target.title,
          status: l.target.status,
          issueType: l.target.issueType,
        })),
        ...t.incomingLinks.map((l) => ({
          id: l.id,
          type: l.type,
          direction: "inward" as const,
          issueKey: issueKey(keyPrefix, l.source.issueNumber),
          taskId: l.source.id,
          title: l.source.title,
          status: l.source.status,
          issueType: l.source.issueType,
        })),
      ];

      return {
        id: t.id,
        title: t.title,
        description: t.description,
        priority: t.priority,
        position: t.position,
        dueDate: t.dueDate ? t.dueDate.toISOString() : null,
        estimateMinutes: t.estimateMinutes,
        timeSpentMinutes: t.timeSpentMinutes,
        listId: t.listId,
        issueNumber: t.issueNumber,
        issueKey: issueKey(keyPrefix, t.issueNumber),
        issueType: t.issueType,
        status: t.status,
        storyPoints: t.storyPoints,
        labels: t.labels,
        reporter: t.reporter
          ? { id: t.reporter.id, name: t.reporter.name, avatarUrl: t.reporter.avatarUrl }
          : null,
        sprintId: t.sprintId,
        links,
        creator: {
          id: t.creator.id,
          name: t.creator.name,
          avatarUrl: t.creator.avatarUrl,
        },
        assignees: t.assignees.map((a) => ({
          id: a.user.id,
          name: a.user.name,
          avatarUrl: a.user.avatarUrl,
          title: a.user.title,
        })),
        // Fetched newest-first (capped at MAX_COMMENTS); reverse to oldest-first
        // for the thread display order.
        comments: [...t.comments]
          .reverse()
          .map((c) => ({
            id: c.id,
            body: c.body,
            createdAt: c.createdAt.toISOString(),
            author: {
              id: c.author.id,
              name: c.author.name,
              avatarUrl: c.author.avatarUrl,
            },
          })),
      };
    }),
  }));

  // Assignment is scoped to the project's own roster.
  const members: MemberDTO[] = project.members.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    avatarUrl: m.user.avatarUrl,
    title: m.user.title,
  }));

  const sprints: SprintDTO[] = project.board.sprints.map((s) => ({
    id: s.id,
    name: s.name,
    goal: s.goal,
    status: s.status,
    startDate: s.startDate ? s.startDate.toISOString() : null,
    endDate: s.endDate ? s.endDate.toISOString() : null,
  }));

  return (
    <div className="mx-auto max-w-[1400px]">
      <Link
        href="/projects"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-ink-400 transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All projects
      </Link>

      <PageHeader
        icon={KanbanSquare}
        title={project.name}
        subtitle={project.description || "This project's dedicated Trello board."}
        action={
          <div className="flex items-center gap-1.5">
            <div className="flex items-center">
              {members.slice(0, 5).map((m, i) => (
                <div
                  key={m.id}
                  className={i > 0 ? "-ml-2 rounded-full ring-2 ring-surface" : "rounded-full ring-2 ring-surface"}
                >
                  <Avatar name={m.name} src={m.avatarUrl} size="sm" />
                </div>
              ))}
              {members.length > 5 && (
                <span className="-ml-2 grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-[10px] font-semibold text-ink-400 ring-2 ring-surface">
                  +{members.length - 5}
                </span>
              )}
            </div>
            <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink-500">
              <Users className="h-3.5 w-3.5" />
              {members.length}
            </span>
          </div>
        }
      />

      {/* Admins manage the public client link; everyone else just sees the board. */}
      {isAdmin && (
        <ShareLinkPanel
          projectId={project.id}
          initialUrl={project.shareToken ? shareUrl(project.shareToken) : null}
        />
      )}

      <BoardClient
        lists={lists}
        members={members}
        sprints={sprints}
        boardId={project.board.id}
        keyPrefix={keyPrefix}
        currentUserId={user?.id ?? null}
        isManager={isManagerTier(user?.role)}
      />

      <AddList boardId={project.board.id} />
    </div>
  );
}

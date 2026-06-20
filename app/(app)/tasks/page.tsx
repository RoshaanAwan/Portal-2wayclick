import { KanbanSquare } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isManagerTier } from "@/lib/permissions";
import { issueKey } from "@/lib/issues";
import {
  BoardClient,
  type ListDTO,
  type MemberDTO,
  type SprintDTO,
  type IssueLinkDTO,
} from "./BoardClient";

export default async function TasksPage() {
  const user = await getCurrentUser();

  // The seed creates a single board; load the oldest one.
  // Comments are capped to the most recent MAX_COMMENTS per card (the thread
  // view) so a busy board doesn't load an unbounded comment history up front;
  // the card's count badge reads from `_count`, which stays exact.
  const MAX_COMMENTS = 50;

  const board = await db.board.findFirst({
    orderBy: { createdAt: "asc" },
    include: {
      sprints: {
        orderBy: [{ status: "asc" }, { position: "asc" }],
      },
      lists: {
        orderBy: { position: "asc" },
        include: {
          tasks: {
            orderBy: { position: "asc" },
            include: {
              creator: { select: { id: true, name: true, avatarUrl: true } },
              reporter: { select: { id: true, name: true, avatarUrl: true } },
              assignees: {
                include: {
                  user: {
                    select: { id: true, name: true, avatarUrl: true, title: true },
                  },
                },
              },
              comments: {
                // Newest-first so `take` keeps the most recent; reversed below
                // for the oldest-first thread order the modal expects.
                orderBy: { createdAt: "desc" },
                take: MAX_COMMENTS,
                include: {
                  author: { select: { id: true, name: true, avatarUrl: true } },
                },
              },
              // Both directions of every issue link, with the other card's
              // shape so the modal can render the key + status without a second
              // round-trip.
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
  });

  const keyPrefix = board?.keyPrefix ?? "TASK";

  // Full roster for the assignment + reporter pickers.
  const members = await db.user.findMany({
    where: { disabledAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, avatarUrl: true, title: true },
  });

  const lists: ListDTO[] = (board?.lists ?? []).map((list) => ({
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
        // Fetched newest-first (so `take` keeps the latest); reverse for the
        // oldest-first thread order the card/modal renders.
        comments: t.comments
          .slice()
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

  const memberDTOs: MemberDTO[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    avatarUrl: m.avatarUrl,
    title: m.title,
  }));

  const sprints: SprintDTO[] = (board?.sprints ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    goal: s.goal,
    status: s.status,
    startDate: s.startDate ? s.startDate.toISOString() : null,
    endDate: s.endDate ? s.endDate.toISOString() : null,
  }));

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        icon={KanbanSquare}
        title={board?.name ?? "Tasks"}
        subtitle="Plan sprints, track issues across the workflow, and assign your team."
      />
      <BoardClient
        lists={lists}
        members={memberDTOs}
        sprints={sprints}
        boardId={board?.id ?? null}
        keyPrefix={keyPrefix}
        currentUserId={user?.id ?? null}
        isManager={isManagerTier(user?.role)}
      />
    </div>
  );
}

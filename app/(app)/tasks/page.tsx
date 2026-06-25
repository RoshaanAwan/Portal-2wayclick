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
} from "./BoardClient";

export default async function TasksPage() {
  const user = await getCurrentUser();

  // The seed creates a single board; load the oldest one. Each card loads only
  // its summary counts (_count) + cover attachment; the full comment thread,
  // attachments, and issue links are lazy-loaded into the modal on open via
  // GET /api/tasks/[id]/detail, so a busy board stays light.

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
              // Card-level counts so the board renders comment/attachment/link
              // badges without hydrating every related row up front.
              _count: {
                select: {
                  comments: true,
                  attachments: true,
                  outgoingLinks: true,
                  incomingLinks: true,
                },
              },
              creator: { select: { id: true, name: true, avatarUrl: true } },
              reporter: { select: { id: true, name: true, avatarUrl: true } },
              assignees: {
                include: {
                  user: {
                    select: { id: true, name: true, avatarUrl: true, title: true },
                  },
                },
              },
              // Only the cover (most recent attachment) is loaded for the
              // board — the full comment thread, all attachments, and issue
              // links are lazy-loaded into the modal on open via
              // GET /api/tasks/[id]/detail. The _count above feeds the card
              // badges without hydrating those rows.
              attachments: {
                orderBy: { createdAt: "desc" },
                take: 1,
                include: {
                  uploader: { select: { id: true, name: true, avatarUrl: true } },
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
      // The cover is the most recent attachment (take: 1 in the query above).
      const cover = t.attachments[0]
        ? {
            id: t.attachments[0].id,
            name: t.attachments[0].name,
            mimeType: t.attachments[0].mimeType,
            url: `/api/tasks/attachment/proxy?id=${t.attachments[0].id}`,
            createdAt: t.attachments[0].createdAt.toISOString(),
            uploader: {
              id: t.attachments[0].uploader.id,
              name: t.attachments[0].uploader.name,
              avatarUrl: t.attachments[0].uploader.avatarUrl,
            },
          }
        : null;

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
        // Lazy-loaded into the modal on open via GET /api/tasks/[id]/detail.
        links: [],
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
        // Lazy-loaded into the modal on open (see links above).
        comments: [],
        attachments: [],
        // Card summary: counts + cover, so TaskCard renders badges/cover without
        // hydrating the full arrays (those come from the detail endpoint).
        commentCount: t._count.comments,
        attachmentCount: t._count.attachments,
        linkCount: t._count.outgoingLinks + t._count.incomingLinks,
        cover,
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

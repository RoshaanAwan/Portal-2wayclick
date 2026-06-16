import { KanbanSquare } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { BoardClient, type ListDTO, type MemberDTO } from "./BoardClient";

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
      lists: {
        orderBy: { position: "asc" },
        include: {
          tasks: {
            orderBy: { position: "asc" },
            include: {
              creator: { select: { id: true, name: true, avatarUrl: true } },
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
            },
          },
        },
      },
    },
  });

  // Full roster for the assignment picker.
  const members = await db.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, avatarUrl: true, title: true },
  });

  const lists: ListDTO[] = (board?.lists ?? []).map((list) => ({
    id: list.id,
    name: list.name,
    position: list.position,
    tasks: list.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      position: t.position,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      listId: t.listId,
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
    })),
  }));

  const memberDTOs: MemberDTO[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    avatarUrl: m.avatarUrl,
    title: m.title,
  }));

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        icon={KanbanSquare}
        title={board?.name ?? "Tasks"}
        subtitle="Drag cards across lists and assign teammates — your shared board."
      />
      <BoardClient
        lists={lists}
        members={memberDTOs}
        currentUserId={user?.id ?? null}
      />
    </div>
  );
}

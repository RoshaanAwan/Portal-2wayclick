import { db } from "@/lib/db";
import { issueKey } from "@/lib/issues";
import { AssignedCards, type AssignedCardDTO } from "./AssignedCards";
import type { SafeUser } from "@/lib/auth";

// "My cards" for the dashboard: the open issues the signed-in user is an
// assignee on. We pull the card's board (for the issue key) and the board's
// project through its list, so each row deep-links into the project board it
// lives on (/projects/<id>). Cards on the standalone /tasks board have no
// project and fall back to the task detail page. Done cards are dropped so
// this reads as an actionable to-do list, not history.
export async function AssignedCardsSection({ user }: { user: SafeUser }) {
  const assignments = await db.taskAssignee.findMany({
    where: {
      userId: user.id,
      task: { status: { not: "DONE" } },
    },
    orderBy: { task: { dueDate: { sort: "asc", nulls: "last" } } },
    take: 6,
    select: {
      task: {
        select: {
          id: true,
          title: true,
          status: true,
          issueType: true,
          priority: true,
          issueNumber: true,
          dueDate: true,
          list: {
            select: {
              board: {
                select: {
                  keyPrefix: true,
                  project: { select: { id: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  // Separate count of everything outstanding so the header can show "N total"
  // even though the list itself is capped at 6.
  const total = await db.taskAssignee.count({
    where: { userId: user.id, task: { status: { not: "DONE" } } },
  });

  const cards: AssignedCardDTO[] = assignments.map(({ task }) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    issueType: task.issueType,
    priority: task.priority,
    issueKey: issueKey(task.list.board.keyPrefix, task.issueNumber),
    projectId: task.list.board.project?.id ?? null,
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
  }));

  return <AssignedCards cards={cards} total={total} />;
}

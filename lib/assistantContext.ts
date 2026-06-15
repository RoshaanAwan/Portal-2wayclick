import "server-only";
import { db } from "./db";
import { can } from "./permissions";
import type { SafeUser } from "./auth";

// ── AI assistant context ──────────────────────────────────────────────────────
// Builds a compact, permission-scoped snapshot of the portal for the logged-in
// user, which is handed to the model as system context. The model only ever sees
// what THIS user is allowed to see — leave requests for managers, the directory,
// the user's own tasks, announcements, and documents. Nothing here exposes
// passwords, session tokens, or audit logs.
//
// Kept small on purpose: a focused snapshot answers "who's out next week?",
// "what's on my plate?", "find the brand doc" without dumping the whole DB.

function fmtDate(d: Date): string {
  // YYYY-MM-DD — unambiguous for the model.
  return d.toISOString().slice(0, 10);
}

export async function buildAssistantContext(user: SafeUser): Promise<string> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Run the independent reads in parallel.
  const [
    directory,
    announcements,
    documents,
    myTasks,
    upcomingLeave,
    pendingLeaveForReviewer,
  ] = await Promise.all([
    // Directory — everyone can see the people list (names, titles, depts).
    db.user.findMany({
      select: { name: true, title: true, department: true, location: true },
      orderBy: { name: "asc" },
      take: 60,
    }),
    // Recent announcements.
    db.announcement.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { title: true, category: true, createdAt: true, pinned: true },
    }),
    // Document library (metadata only — titles/categories, not file contents).
    db.document.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { title: true, category: true, fileType: true },
    }),
    // The user's own assigned tasks (their plate).
    db.task.findMany({
      where: { assignees: { some: { userId: user.id } } },
      orderBy: [{ dueDate: "asc" }],
      take: 25,
      select: {
        title: true,
        priority: true,
        dueDate: true,
        list: { select: { name: true } },
      },
    }),
    // Approved time-off in the next 30 days — "who's out?".
    db.leaveRequest.findMany({
      where: {
        status: "APPROVED",
        endDate: { gte: now },
        startDate: { lte: horizon },
      },
      orderBy: { startDate: "asc" },
      take: 40,
      select: {
        type: true,
        startDate: true,
        endDate: true,
        owner: { select: { name: true } },
      },
    }),
    // Pending leave the user can act on — only if they may decide leave.
    can.decideLeave(user.role)
      ? db.leaveRequest.findMany({
          where: { status: "PENDING" },
          orderBy: { startDate: "asc" },
          take: 25,
          select: {
            type: true,
            startDate: true,
            endDate: true,
            owner: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const lines: string[] = [];
  lines.push(`Today is ${fmtDate(now)}.`);
  lines.push(
    `The current user is ${user.name} (${user.title}, ${user.department} dept, role ${user.role}).`,
  );

  lines.push("\n## People directory");
  for (const p of directory) {
    lines.push(
      `- ${p.name} — ${p.title}, ${p.department}${p.location ? `, ${p.location}` : ""}`,
    );
  }

  lines.push("\n## Who's out (approved time-off, next 30 days)");
  if (upcomingLeave.length === 0) lines.push("- Nobody has approved time-off in this window.");
  for (const l of upcomingLeave) {
    lines.push(
      `- ${l.owner.name}: ${l.type}, ${fmtDate(l.startDate)} → ${fmtDate(l.endDate)}`,
    );
  }

  if (can.decideLeave(user.role)) {
    lines.push("\n## Pending leave requests awaiting a decision");
    if (pendingLeaveForReviewer.length === 0) lines.push("- None pending.");
    for (const l of pendingLeaveForReviewer) {
      lines.push(
        `- ${l.owner.name}: ${l.type}, ${fmtDate(l.startDate)} → ${fmtDate(l.endDate)}`,
      );
    }
  }

  lines.push(`\n## ${user.name}'s assigned tasks`);
  if (myTasks.length === 0) lines.push("- No tasks currently assigned.");
  for (const t of myTasks) {
    const due = t.dueDate ? `, due ${fmtDate(t.dueDate)}` : "";
    lines.push(`- [${t.priority}] ${t.title} (in “${t.list.name}”)${due}`);
  }

  lines.push("\n## Recent announcements");
  for (const a of announcements) {
    lines.push(`- ${a.pinned ? "📌 " : ""}${a.title} (${a.category}, ${fmtDate(a.createdAt)})`);
  }

  lines.push("\n## Document library (titles & categories)");
  for (const d of documents) {
    lines.push(`- ${d.title} — ${d.category} (${d.fileType})`);
  }

  return lines.join("\n");
}

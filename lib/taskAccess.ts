import "server-only";
import { db } from "./db";
import { can } from "./permissions";

// ── Task / board access control ──────────────────────────────────────────────
// Project boards are PRIVATE: their /projects/[id] page is membership-gated, and
// lib/clientShare.ts surfaces their cards on login-less public /shared links. But
// the task write routes (create/move/update/assign/unassign/comment/delete) only
// resolved a client-supplied id and mutated it, with no project-membership check
// — so any authenticated user could tamper with a board they aren't a member of
// (and inject content onto the public client board). These helpers are the single
// gate those routes call, mirroring the membership pattern already used by
// app/api/projects/list/create/route.ts.
//
// A board may or may not belong to a project:
//   • project board  → require admin-tier (can.manageProjects) OR a ProjectMember
//                       row. This is the access that was missing.
//   • global board    → the company-wide /tasks board has no project; it stays
//                       open to any authenticated user, exactly as before.

interface Actor {
  id: string;
  role: string | null | undefined;
}

/** Whether `actor` may act on a board owned by `projectId` (or a project-less
 *  board when projectId is null). Admin tier passes for any project. */
async function hasProjectAccess(
  actor: Actor,
  projectId: string | null,
): Promise<boolean> {
  // Project-less board (global /tasks) — open to any authenticated user.
  if (!projectId) return true;
  // Admin tier manages every project.
  if (can.manageProjects(actor.role)) return true;
  // Otherwise the actor must be a member of the owning project.
  const membership = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: actor.id } },
  });
  return !!membership;
}

/**
 * Authorize a task-scoped action by resolving Task → List → Board → Project.
 * Returns:
 *   • { ok: true }                       — caller may proceed
 *   • { ok: false, status: 404 }         — task does not exist
 *   • { ok: false, status: 403 }         — caller is not a member of the project
 * Callers translate the status into their NextResponse.
 */
export async function assertTaskAccess(
  taskId: string,
  actor: Actor,
): Promise<{ ok: true; projectId: string | null } | { ok: false; status: 404 | 403 }> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      // Board↔Project is 1:1 with the FK on Project, so traverse the relation
      // (Board has no projectId scalar). project is null for the global board.
      list: { select: { board: { select: { project: { select: { id: true } } } } } },
    },
  });
  if (!task) return { ok: false, status: 404 };
  const projectId = task.list?.board?.project?.id ?? null;
  if (await hasProjectAccess(actor, projectId)) {
    return { ok: true, projectId };
  }
  return { ok: false, status: 403 };
}

/**
 * Same authorization for a CREATE, which has no task yet — resolve the
 * destination List → Board → Project instead. 404 when the list is missing.
 */
export async function assertListAccess(
  listId: string,
  actor: Actor,
): Promise<{ ok: true; projectId: string | null } | { ok: false; status: 404 | 403 }> {
  const list = await db.boardList.findUnique({
    where: { id: listId },
    select: { id: true, board: { select: { project: { select: { id: true } } } } },
  });
  if (!list) return { ok: false, status: 404 };
  const projectId = list.board?.project?.id ?? null;
  if (await hasProjectAccess(actor, projectId)) {
    return { ok: true, projectId };
  }
  return { ok: false, status: 403 };
}

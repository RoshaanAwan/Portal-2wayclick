import "server-only";
import { headers } from "next/headers";
import { db } from "./db";
import type { SafeUser } from "./auth";

// ── Audit logging ────────────────────────────────────────────────────────────
// Writes to the AuditLog table — the "track everything" trail for privileged
// actions, viewable by Super Admin at /admin/logs. Distinct from the social
// Activity feed: this records actor identity (denormalized so it survives user
// deletion), the entity touched, structured before/after detail, and the IP.

/** Stable action identifiers. Keep these grep-able and consistent. */
export type AuditAction =
  | "user.create"
  | "user.role_change"
  | "user.delete"
  | "user.profile_update"
  | "user.avatar_update"
  | "user.password_change"
  | "user.update"
  | "user.disable"
  | "user.enable"
  | "user.password_reset"
  | "auth.login"
  | "auth.logout"
  | "auth.qr_approve"
  | "auth.qr_login"
  | "project.create"
  | "project.update"
  | "project.delete"
  | "project.activate"
  | "project.deactivate"
  | "project.list_create"
  | "project.list_move"
  | "project.member_add"
  | "project.member_remove"
  | "project.share_regenerate"
  | "project.share_revoke"
  | "project.client_submission"
  | "leave.create"
  | "leave.decide"
  | "announcement.create"
  | "announcement.update"
  | "announcement.delete"
  | "announcement.comment"
  | "announcement.react"
  | "document.create"
  | "document.update"
  | "document.delete"
  | "document.upload"
  | "task.create"
  | "task.update"
  | "task.delete"
  | "task.assign"
  | "task.unassign"
  | "task.comment"
  | "task.move"
  | "invoice.create"
  | "invoice.update"
  | "invoice.status_change"
  | "invoice.share_regenerate"
  | "invoice.share_revoke"
  | "invoice.delete"
  | "invoice.payment_started"
  | "invoice.paid"
  | "expense.create"
  | "expense.update"
  | "expense.decide"
  | "expense.delete"
  | "salary.create"
  | "salary.update"
  | "salary.deactivate"
  | "salary.delete"
  | "salary.payment_add"
  | "salary.payment_delete"
  | "project.income_add"
  | "project.income_delete"
  | "project.share_add"
  | "project.share_delete";

interface AuditInput {
  actor: SafeUser | { id?: string | null; name: string; role: string };
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  summary?: string;
  /** Arbitrary structured detail (before/after, inputs). Serialized to JSON. */
  detail?: unknown;
  targetUserId?: string | null;
}

/** Best-effort client IP from common proxy headers (Vercel sets these). */
async function clientMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      null;
    const userAgent = h.get("user-agent") || null;
    return { ip, userAgent };
  } catch {
    return { ip: null, userAgent: null };
  }
}

/**
 * Record an audit entry. Never throws — auditing must not break the action it
 * is recording, so failures are swallowed (logged to the server console).
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    const { ip, userAgent } = await clientMeta();
    await db.auditLog.create({
      data: {
        actorId: input.actor.id ?? null,
        actorName: input.actor.name,
        actorRole: input.actor.role,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        summary: input.summary ?? null,
        detail:
          input.detail === undefined ? null : JSON.stringify(input.detail),
        ip,
        userAgent,
        targetUserId: input.targetUserId ?? null,
      },
    });
  } catch (err) {
    console.error("[audit] failed to record", input.action, err);
  }
}

// ── Audit log read scope ──────────────────────────────────────────────────────
// Who may see whose entries in /admin/logs. Super Admin sees everything; Admin
// and Project Manager see only actions performed by themselves or anyone in
// their org subtree (recursive reports). Scoped by ACTOR, not target.

/** All descendant user ids under `rootId` in the manager→reports tree. */
async function reportSubtreeIds(rootId: string): Promise<string[]> {
  // The tree is shallow in practice; walk it breadth-first with batched queries.
  const collected = new Set<string>();
  let frontier = [rootId];
  while (frontier.length) {
    const reports = await db.user.findMany({
      where: { managerId: { in: frontier } },
      select: { id: true },
    });
    const next: string[] = [];
    for (const r of reports) {
      if (!collected.has(r.id)) {
        collected.add(r.id);
        next.push(r.id);
      }
    }
    frontier = next;
  }
  return [...collected];
}

/**
 * Returns a Prisma `where` filter for the audit log, scoped to what `viewer`
 * may see:
 *   • Super Admin → `{}` (everything).
 *   • Admin / PM  → entries whose actor is the viewer or one of their reports.
 *
 * Returns `null` if the viewer may not see the audit log at all (caller should
 * have already gated, but this keeps the scope honest).
 */
export async function auditActorScope(
  viewer: SafeUser,
): Promise<{ actorId: { in: string[] } } | Record<string, never> | null> {
  if (viewer.role === "SUPER_ADMIN") return {}; // unrestricted

  if (viewer.role === "ADMIN" || viewer.role === "PROJECT_MANAGER") {
    const subtree = await reportSubtreeIds(viewer.id);
    // Include the viewer's own actions plus everyone reporting under them.
    return { actorId: { in: [viewer.id, ...subtree] } };
  }

  return null; // not permitted
}

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
  | "auth.login"
  | "auth.logout"
  | "project.create"
  | "leave.decide"
  | "announcement.create";

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

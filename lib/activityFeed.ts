import "server-only";
import { db } from "./db";
import { broadcastActivity } from "./notifications";
import { requireTenantId } from "./tenantContext";

// ── Activity feed writer ──────────────────────────────────────────────────────
// One call that BOTH persists an Activity row (so the dashboard feed survives a
// reload) AND broadcasts it to every open Live Activity Wall stream (so the feed
// moves in real time, with no refresh). Drop-in replacement for the bare
// `db.activity.create({ data: { userId, verb, target } })` scattered across the
// API routes — swap that for `recordActivity({ actor, verb, target })`.
//
// Best-effort like lib/audit.ts and notify(): a feed write must never break the
// action that triggered it, so failures are swallowed and logged.

/** Stable verbs the wall knows how to tint (see PulseFeed verbColor). */
export type ActivityVerb =
  | "posted"
  | "uploaded"
  | "requested"
  | "approved"
  | "denied"
  | "joined"
  | "commented"
  | "assigned"
  | "created";

interface RecordActivityInput {
  /** Who did it. We need id (FK) plus name/title/avatar for the live payload. */
  actor: {
    id: string;
    name: string;
    title: string;
    avatarUrl?: string | null;
  };
  verb: ActivityVerb;
  /** Human-readable target, e.g. an announcement title or task name. */
  target: string;
  /** Optional structured detail, serialized to JSON on the row. */
  meta?: unknown;
}

/**
 * Persist an activity row and push it to the Live Activity Wall. Never throws.
 *
 * The broadcast carries the actor's name/title/avatar so subscribers can render
 * the entry immediately without a follow-up lookup.
 */
export async function recordActivity(input: RecordActivityInput): Promise<void> {
  try {
    const tenantId = requireTenantId();
    const row = await db.activity.create({
      data: {
        tenantId,
        userId: input.actor.id,
        verb: input.verb,
        target: input.target,
        meta: input.meta === undefined ? null : JSON.stringify(input.meta),
      },
    });

    broadcastActivity(tenantId, {
      id: row.id,
      verb: row.verb,
      target: row.target,
      createdAt: row.createdAt.toISOString(),
      user: {
        name: input.actor.name,
        title: input.actor.title,
        avatarUrl: input.actor.avatarUrl ?? null,
      },
    });
  } catch (err) {
    console.error("[recordActivity] failed", input.verb, err);
  }
}

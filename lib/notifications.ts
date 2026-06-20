import "server-only";
import { EventEmitter } from "events";
import { db } from "./db";
import { sendPushToUser, sendPushToUsers } from "./push";

// ── Notifications ─────────────────────────────────────────────────────────────
// Per-user inbox writer + in-process event bus. notify() persists a row (so it
// survives reloads and shows an accurate unread count) AND emits an event so any
// open SSE stream for that recipient can push the bell update instantly.
//
// Mirrors lib/audit.ts: server-only and best-effort — a notification must never
// break the action that triggered it, so failures are swallowed and logged.

/** Stable notification kinds. Keep these grep-able and consistent. */
export type NotificationType =
  | "leave.decided"
  | "task.assigned"
  | "task.comment"
  | "announcement.created"
  | "invoice.paid"
  | "expense.decided"
  | "message.received";

/**
 * In-process pub/sub for live (SSE) delivery. One emitter per server instance;
 * events are keyed by recipient userId. This is intentionally simple — it works
 * for a single Node process (dev, and a single serverless/long-running instance).
 * At multi-instance scale you'd swap this for Redis pub/sub or Postgres LISTEN,
 * but the DB row is always the source of truth, so the bell stays correct either
 * way (it reconciles against the API on open).
 */
const bus = new EventEmitter();
// A busy portal can have many concurrent SSE listeners; lift the default cap so
// Node doesn't print a spurious "possible memory leak" warning.
bus.setMaxListeners(0);

export interface LiveNotification {
  id: string;
  type: string;
  message: string;
  link: string | null;
  actorName: string | null;
  actorAvatar: string | null;
  createdAt: string;
  readAt: string | null;
}

/** Subscribe to live notifications for one user. Returns an unsubscribe fn. */
export function subscribe(
  userId: string,
  handler: (n: LiveNotification) => void,
): () => void {
  const channel = `notif:${userId}`;
  bus.on(channel, handler);
  return () => bus.off(channel, handler);
}

// ── Live chat messages ────────────────────────────────────────────────────────
// A per-user channel (chat-user:<id>), separate from the bell's notif:<id>
// channel, that carries every message addressed to a user — across all their
// conversations — over one SSE stream (app/api/messages/stream). The client uses
// it to append to an open thread AND to keep the conversation list + unread
// badge live for threads that aren't open. A normal notify() call (fired
// alongside the publish in lib/messaging.ts) still handles the bell + Web Push,
// so recipients are alerted even with the app closed. Same single-process caveat
// as the bell bus: the Message row is the source of truth and reconciles on
// reload. The publish includes the sender too (multi-tab); clients dedupe.

/** Shape pushed down the chat stream. `clientId` echoes the sender's optimistic
 *  temp id so their own tab can reconcile instead of rendering a duplicate. */
export interface LiveMessage {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderName: string;
  senderAvatar: string | null;
  body: string;
  createdAt: string;
  clientId?: string | null;
}

/** Subscribe to live chat messages for one user. Returns an unsubscribe fn. */
export function subscribeChat(
  userId: string,
  handler: (m: LiveMessage) => void,
): () => void {
  const channel = `chat-user:${userId}`;
  bus.on(channel, handler);
  return () => bus.off(channel, handler);
}

/** Push one message to every recipient's open chat stream. De-dupes the
 *  recipient list. Best-effort, never throws. */
export function publishChatToUsers(userIds: string[], msg: LiveMessage): void {
  try {
    for (const userId of new Set(userIds)) {
      bus.emit(`chat-user:${userId}`, msg);
    }
  } catch (err) {
    console.error("[publishChatToUsers] failed", msg.conversationId, err);
  }
}

interface NotifyInput {
  /** Recipient. */
  userId: string;
  type: NotificationType;
  message: string;
  link?: string | null;
  /** Who caused it (optional). Name/avatar are denormalized onto the row. */
  actor?: { id?: string | null; name: string; avatarUrl?: string | null } | null;
}

/**
 * Create a notification for a single user. Never throws.
 *
 * Skips self-notifications: if the actor is the recipient, there's nothing to
 * tell them — they just did the thing.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    if (input.actor?.id && input.actor.id === input.userId) return;

    const row = await db.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        message: input.message,
        link: input.link ?? null,
        actorId: input.actor?.id ?? null,
        actorName: input.actor?.name ?? null,
        actorAvatar: input.actor?.avatarUrl ?? null,
      },
    });

    // Push to any open SSE stream for this recipient.
    const live: LiveNotification = {
      id: row.id,
      type: row.type,
      message: row.message,
      link: row.link,
      actorName: row.actorName,
      actorAvatar: row.actorAvatar,
      createdAt: row.createdAt.toISOString(),
      readAt: null,
    };
    bus.emit(`notif:${input.userId}`, live);

    // Fan out an OS-level Web Push to the recipient's subscribed devices (works
    // even when the app is closed). Fire-and-forget so push latency never slows
    // the action that triggered this; sendPushToUser is best-effort/never throws.
    const title = input.actor?.name
      ? `${input.actor.name}`
      : "2WayClick";
    void sendPushToUser(input.userId, {
      title,
      body: input.message,
      url: input.link ?? "/dashboard",
      tag: input.type,
    });
  } catch (err) {
    console.error("[notify] failed", input.type, err);
  }
}

/**
 * Fan out the same notification to many recipients (e.g. a company-wide
 * announcement). Never throws.
 *
 * Behaviourally identical to calling notify() once per recipient — same rows,
 * same self-skip, same SSE bell events, same Web Push — but it batches the two
 * DB-heavy parts so a company-wide post is a couple of queries instead of O(N):
 *   • one `createMany` insert for every recipient's row (was N inserts),
 *   • one `sendPushToUsers` (one subscription lookup) instead of N.
 * The SSE emit and the push payload are per-recipient/shared exactly as before.
 */
export async function notifyMany(
  userIds: string[],
  input: Omit<NotifyInput, "userId">,
): Promise<void> {
  try {
    // Drop the actor (self-notification) up front — notify() does this per row;
    // we must replicate it before the batch insert.
    const actorId = input.actor?.id ?? null;
    const recipients = [...new Set(userIds)].filter((id) => id !== actorId);
    if (recipients.length === 0) return;

    const actorName = input.actor?.name ?? null;
    const actorAvatar = input.actor?.avatarUrl ?? null;
    const createdAt = new Date();

    // One insert for all recipient rows (createMany returns no IDs).
    await db.notification.createMany({
      data: recipients.map((userId) => ({
        userId,
        type: input.type,
        message: input.message,
        link: input.link ?? null,
        actorId,
        actorName,
        actorAvatar,
        createdAt,
      })),
    });

    // Re-read the rows we just created so the SSE bell payload carries real ids
    // (only those connected right now consume this; the DB row is the source of
    // truth and reconciles on reload either way).
    const rows = await db.notification.findMany({
      where: {
        userId: { in: recipients },
        type: input.type,
        createdAt,
      },
      select: {
        id: true,
        userId: true,
        type: true,
        message: true,
        link: true,
        actorName: true,
        actorAvatar: true,
        createdAt: true,
      },
    });
    for (const row of rows) {
      const live: LiveNotification = {
        id: row.id,
        type: row.type,
        message: row.message,
        link: row.link,
        actorName: row.actorName,
        actorAvatar: row.actorAvatar,
        createdAt: row.createdAt.toISOString(),
        readAt: null,
      };
      bus.emit(`notif:${row.userId}`, live);
    }

    // Web Push to every recipient with ONE subscription lookup. The payload is
    // identical across recipients (same actor/message), exactly as the per-user
    // path produced. Fire-and-forget so push latency never slows the caller.
    const title = actorName ? `${actorName}` : "2WayClick";
    void sendPushToUsers(recipients, {
      title,
      body: input.message,
      url: input.link ?? "/dashboard",
      tag: input.type,
    });
  } catch (err) {
    console.error("[notifyMany] failed", input.type, err);
  }
}

// ── Live activity wall ────────────────────────────────────────────────────────
// A single, company-wide broadcast channel (distinct from per-user notif:<id>
// channels above) that powers the dashboard's Live Activity Wall. Anyone with an
// open activity stream receives every event — it's the public "what's happening
// right now" pulse, not a private inbox. Same single-process caveat as the bus
// above; the Activity table remains the source of truth on reload.

const ACTIVITY_CHANNEL = "activity:wall";

/** Shape pushed to the Live Activity Wall (mirrors the dashboard FeedItem). */
export interface LiveActivity {
  id: string;
  verb: string;
  target: string;
  createdAt: string;
  user: {
    name: string;
    title: string;
    avatarUrl: string | null;
  };
}

/** Subscribe to the company-wide activity wall. Returns an unsubscribe fn. */
export function subscribeActivity(
  handler: (a: LiveActivity) => void,
): () => void {
  bus.on(ACTIVITY_CHANNEL, handler);
  return () => bus.off(ACTIVITY_CHANNEL, handler);
}

/** Push one activity to every open wall stream. Best-effort, never throws. */
export function broadcastActivity(activity: LiveActivity): void {
  try {
    bus.emit(ACTIVITY_CHANNEL, activity);
  } catch (err) {
    console.error("[broadcastActivity] failed", activity.verb, err);
  }
}

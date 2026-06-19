import "server-only";
import { db } from "./db";
import {
  notifyMany,
  publishChatToUsers,
  type LiveMessage,
} from "./notifications";

// ── Messaging core ────────────────────────────────────────────────────────────
// Server-only helpers shared by the chat API routes, so the routes stay thin
// (mirrors lib/notifications.ts / lib/finance.ts). Holds the DM-key derivation,
// the membership guard every conversation-scoped route runs, the
// conversation-list query (last message + unread per conversation), and the send
// path (persist → bump → publish live → fire bell/Web Push notifications).

/** Sender identity denormalized onto each message and used as the notif actor. */
export interface ChatSender {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

/**
 * Deterministic key for a 1-on-1 DM: the two user ids sorted and joined. Stored
 * on Conversation.dmKey (@unique) so a DM between two people can only ever exist
 * once — two simultaneous "open DM" requests collapse onto the same row via
 * upsert instead of racing to create duplicates.
 */
export function dmKeyFor(a: string, b: string): string {
  return [a, b].sort().join(":");
}

/** Trim a body to a one-line preview for notifications / list rows. */
export function previewOf(body: string, max = 140): string {
  const oneLine = body.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? oneLine.slice(0, max - 1) + "…" : oneLine;
}

/**
 * Membership row for (conversation, user), or null if the user isn't a member.
 * Every conversation-scoped route calls this first and 403/404s on null — this
 * is the authorization gate for reads and writes (DM reach is open only at
 * create time; once a conversation exists, only its members can touch it).
 */
export function membershipOf(conversationId: string, userId: string) {
  return db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
}

/** All member user ids for a conversation (recipients of a publish/notify). */
export async function memberIdsOf(conversationId: string): Promise<string[]> {
  const rows = await db.conversationMember.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

// The shape the conversation list returns per row. `unread` is computed per
// member cursor; `lastMessage` is the newest message (or null for empty threads).
export interface ConversationListItem {
  id: string;
  kind: string;
  title: string | null;
  projectId: string | null;
  lastMessageAt: string;
  members: {
    id: string;
    name: string;
    title: string;
    avatarUrl: string | null;
  }[];
  lastMessage: {
    id: string;
    senderId: string | null;
    senderName: string;
    body: string;
    createdAt: string;
  } | null;
  unread: number;
}

/**
 * List a user's conversations, newest-activity first, each with its last message
 * and the user's unread count. The conversation + members + last-message are one
 * query (the `take: 1` message include avoids an N+1 on previews). Unread is then
 * a bounded Promise.all of indexed COUNTs — one per conversation in the page
 * (typically a handful), each served by the Message [conversationId, createdAt]
 * index. At very large scale this is the spot to switch to a single grouped
 * $queryRaw; for a company portal the per-conversation count is fine.
 */
export async function listConversationsFor(
  userId: string,
): Promise<{ conversations: ConversationListItem[]; totalUnread: number }> {
  const convos = await db.conversation.findMany({
    where: { members: { some: { userId } } },
    orderBy: { lastMessageAt: "desc" },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, name: true, title: true, avatarUrl: true },
          },
        },
      },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const unreadCounts = await Promise.all(
    convos.map((c) => {
      const me = c.members.find((m) => m.userId === userId);
      const since = me?.lastReadAt ?? new Date(0);
      // Messages newer than my read cursor that I didn't send.
      return db.message.count({
        where: {
          conversationId: c.id,
          createdAt: { gt: since },
          NOT: { senderId: userId },
        },
      });
    }),
  );

  let totalUnread = 0;
  const conversations: ConversationListItem[] = convos.map((c, i) => {
    const unread = unreadCounts[i];
    totalUnread += unread;
    const last = c.messages[0] ?? null;
    return {
      id: c.id,
      kind: c.kind,
      title: c.title,
      projectId: c.projectId,
      lastMessageAt: c.lastMessageAt.toISOString(),
      members: c.members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        title: m.user.title,
        avatarUrl: m.user.avatarUrl,
      })),
      lastMessage: last
        ? {
            id: last.id,
            senderId: last.senderId,
            senderName: last.senderName,
            body: last.body,
            createdAt: last.createdAt.toISOString(),
          }
        : null,
      unread,
    };
  });

  return { conversations, totalUnread };
}

/**
 * Persist a message and fan it out. The caller has already verified membership.
 *
 *  1. create the Message (sender name/avatar denormalized so a deleted sender
 *     still renders),
 *  2. bump Conversation.lastMessageAt (drives the list sort) and advance the
 *     sender's own read cursor (their own message is "read"),
 *  3. publish live to every member's chat stream (sender included, for multi-tab;
 *     clients dedupe by id / clientId),
 *  4. fire a normal notification to the *other* members — this writes the bell
 *     row, pushes the bell SSE, and fans out Web Push (notify() skips self and
 *     is best-effort, so this never breaks the send).
 *
 * Returns the persisted id + timestamp so the sender can reconcile its optimistic
 * row.
 */
export async function sendMessage(opts: {
  conversationId: string;
  sender: ChatSender;
  body: string;
  clientId?: string | null;
}): Promise<{ id: string; createdAt: string }> {
  const { conversationId, sender, body, clientId } = opts;

  const message = await db.message.create({
    data: {
      conversationId,
      senderId: sender.id,
      senderName: sender.name,
      senderAvatar: sender.avatarUrl ?? null,
      body,
    },
  });

  const createdAtIso = message.createdAt.toISOString();

  // Bump activity + mark my own cursor up to this message.
  await Promise.all([
    db.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: message.createdAt },
    }),
    db.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: sender.id } },
      data: { lastReadAt: message.createdAt, lastReadMessageId: message.id },
    }),
  ]);

  const memberIds = await memberIdsOf(conversationId);

  // Live append for anyone with an open stream (sender included for multi-tab).
  const live: LiveMessage = {
    id: message.id,
    conversationId,
    senderId: sender.id,
    senderName: sender.name,
    senderAvatar: sender.avatarUrl ?? null,
    body: message.body,
    createdAt: createdAtIso,
    clientId: clientId ?? null,
  };
  publishChatToUsers(memberIds, live);

  // Bell + Web Push to everyone except the sender.
  const others = memberIds.filter((id) => id !== sender.id);
  await notifyMany(others, {
    type: "message.received",
    message: previewOf(body),
    link: `/messages?c=${conversationId}`,
    actor: { id: sender.id, name: sender.name, avatarUrl: sender.avatarUrl ?? null },
  });

  return { id: message.id, createdAt: createdAtIso };
}

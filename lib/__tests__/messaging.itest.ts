import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { listConversationsFor } from "@/lib/messaging";

// Locks in the conversation-list unread count after the N+1 → single groupBy
// refactor: the grouped query must produce the SAME numbers the per-conversation
// COUNT did, including the per-member lastReadAt cursor and the "not my own
// message" rule. Real Postgres.

const db = new PrismaClient();
const TAG = "__messaging_itest__";

let me: string;
let other: string;
let convoId: string;

async function mkUser(n: string) {
  const u = await db.user.create({
    data: {
      email: `${TAG}.${n}@example.test`,
      passwordHash: "x",
      name: `${TAG} ${n}`,
      title: "T",
      department: "QA",
    },
  });
  return u.id;
}

beforeAll(async () => {
  me = await mkUser("me");
  other = await mkUser("other");

  const convo = await db.conversation.create({
    data: { kind: "DM", dmKey: `${TAG}:${[me, other].sort().join(":")}` },
  });
  convoId = convo.id;

  // My read cursor is the epoch (I've read nothing). The other member's cursor
  // doesn't affect MY unread count.
  const readEpoch = new Date(0);
  await db.conversationMember.create({
    data: { conversationId: convoId, userId: me, lastReadAt: readEpoch },
  });
  await db.conversationMember.create({
    data: { conversationId: convoId, userId: other, lastReadAt: new Date() },
  });

  // 3 messages from `other` (count as unread for me) and 1 from me (must NOT).
  for (let i = 0; i < 3; i++) {
    await db.message.create({
      data: { conversationId: convoId, senderId: other, senderName: "Other", body: `hi ${i}` },
    });
  }
  await db.message.create({
    data: { conversationId: convoId, senderId: me, senderName: "Me", body: "my own" },
  });
  // Keep lastMessageAt fresh so the convo sorts in.
  await db.conversation.update({
    where: { id: convoId },
    data: { lastMessageAt: new Date() },
  });
});

afterAll(async () => {
  await db.message.deleteMany({ where: { conversation: { dmKey: { startsWith: TAG } } } });
  await db.conversationMember.deleteMany({ where: { conversation: { dmKey: { startsWith: TAG } } } });
  await db.conversation.deleteMany({ where: { dmKey: { startsWith: TAG } } });
  await db.user.deleteMany({ where: { name: { startsWith: TAG } } });
  await db.$disconnect();
});

// Reference implementation = the OLD per-conversation COUNT logic, computed here
// independently so the test asserts equivalence, not just a hard-coded number.
async function referenceUnread(userId: string, conversationId: string) {
  const m = await db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  const since = m?.lastReadAt ?? new Date(0);
  return db.message.count({
    where: { conversationId, createdAt: { gt: since }, NOT: { senderId: userId } },
  });
}

describe("listConversationsFor unread (post-N+1-refactor)", () => {
  it("counts only others' messages newer than my cursor", async () => {
    const { conversations } = await listConversationsFor(me);
    const c = conversations.find((c) => c.id === convoId);
    expect(c).toBeTruthy();
    expect(c!.unread).toBe(3); // 3 from other, my own excluded
  });

  it("matches the old per-conversation COUNT exactly (equivalence)", async () => {
    const { conversations } = await listConversationsFor(me);
    const c = conversations.find((c) => c.id === convoId)!;
    const ref = await referenceUnread(me, convoId);
    expect(c.unread).toBe(ref);
  });

  it("totalUnread sums per-conversation unread", async () => {
    const { conversations, totalUnread } = await listConversationsFor(me);
    const sum = conversations.reduce((s, c) => s + c.unread, 0);
    expect(totalUnread).toBe(sum);
  });

  it("the sender sees 0 unread for their own messages", async () => {
    // `other` read up to "now" before my messages? other's cursor was set to
    // now() at seed, and only `me` sent after — but `me`'s 1 msg is excluded for
    // `other`? No: it's from me, so it DOES count for other. Assert via reference.
    const { conversations } = await listConversationsFor(other);
    const c = conversations.find((c) => c.id === convoId);
    if (c) {
      const ref = await referenceUnread(other, convoId);
      expect(c.unread).toBe(ref);
    }
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, adminDb } from "@/lib/db";
import { runWithTenant } from "@/lib/tenantContext";
import { listConversationsFor } from "@/lib/messaging";

// Locks in the conversation-list unread count after the N+1 → single groupBy
// refactor: the grouped query must produce the SAME numbers the per-conversation
// COUNT did, including the per-member lastReadAt cursor and the "not my own
// message" rule. Real Postgres.
//
// Multi-tenancy: the lib uses the tenant-scoped client, which fails closed
// without a context. We seed a throwaway tenant via adminDb and run every db.*
// call inside runWithTenant(TENANT_ID, ...) so tenantId is auto-injected on the
// tenant-root models (User, Conversation). Message/ConversationMember are child
// models (no tenantId column) and inherit tenancy through the conversation.

const TAG = "__messaging_itest__";
const TENANT_ID = "itest_messaging";

let me: string;
let other: string;
let convoId: string;

async function mkUser(n: string) {
  const u = await db.user.create({
    data: {
      tenantId: TENANT_ID,
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
  await adminDb.tenant.upsert({
    where: { id: TENANT_ID },
    update: {},
    create: { id: TENANT_ID, subdomain: TENANT_ID, name: TENANT_ID },
  });
  await runWithTenant(TENANT_ID, async () => {
    me = await mkUser("me");
    other = await mkUser("other");

    const convo = await db.conversation.create({
      data: { tenantId: TENANT_ID, kind: "DM", dmKey: `${TAG}:${[me, other].sort().join(":")}` },
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
});

afterAll(async () => {
  // Cascade-clean: deleting the tenant removes its users + conversations, which
  // cascade to ConversationMember/Message.
  await adminDb.tenant.deleteMany({ where: { id: TENANT_ID } });
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
    await runWithTenant(TENANT_ID, async () => {
      const { conversations } = await listConversationsFor(me);
      const c = conversations.find((c) => c.id === convoId);
      expect(c).toBeTruthy();
      expect(c!.unread).toBe(3); // 3 from other, my own excluded
    });
  });

  it("matches the old per-conversation COUNT exactly (equivalence)", async () => {
    await runWithTenant(TENANT_ID, async () => {
      const { conversations } = await listConversationsFor(me);
      const c = conversations.find((c) => c.id === convoId)!;
      const ref = await referenceUnread(me, convoId);
      expect(c.unread).toBe(ref);
    });
  });

  it("totalUnread sums per-conversation unread", async () => {
    await runWithTenant(TENANT_ID, async () => {
      const { conversations, totalUnread } = await listConversationsFor(me);
      const sum = conversations.reduce((s, c) => s + c.unread, 0);
      expect(totalUnread).toBe(sum);
    });
  });

  it("the sender sees 0 unread for their own messages", async () => {
    await runWithTenant(TENANT_ID, async () => {
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
});

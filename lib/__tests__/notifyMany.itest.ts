import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { notifyMany } from "@/lib/notifications";

// Locks in the batched announcement fan-out: notifyMany must create exactly one
// row per recipient, drop the actor (self-notification), and carry the right
// fields — the same result the old per-user notify() loop produced, now via one
// createMany. (Web Push is a no-op here: VAPID keys aren't set in test.)

const db = new PrismaClient();
const TAG = "__notifymany_itest__";
const MSG = `${TAG} announcement`;

let actorId: string;
let r1: string;
let r2: string;

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
  actorId = await mkUser("actor");
  r1 = await mkUser("r1");
  r2 = await mkUser("r2");
});

afterAll(async () => {
  await db.notification.deleteMany({ where: { message: { startsWith: TAG } } });
  await db.user.deleteMany({ where: { name: { startsWith: TAG } } });
  await db.$disconnect();
});

describe("notifyMany batch fan-out", () => {
  it("creates one row per recipient and drops the actor", async () => {
    await notifyMany([actorId, r1, r2], {
      type: "announcement.created",
      message: MSG,
      link: "/announcements",
      actor: { id: actorId, name: "Actor", avatarUrl: null },
    });

    const rows = await db.notification.findMany({ where: { message: MSG } });
    const recipientIds = rows.map((r) => r.userId).sort();
    expect(recipientIds).toEqual([r1, r2].sort()); // actor excluded
    expect(rows.length).toBe(2);

    // Field fidelity matches the single-notify path.
    for (const row of rows) {
      expect(row.type).toBe("announcement.created");
      expect(row.link).toBe("/announcements");
      expect(row.actorId).toBe(actorId);
      expect(row.actorName).toBe("Actor");
      expect(row.readAt).toBeNull();
    }
  });

  it("de-dupes a repeated recipient id", async () => {
    const msg = `${TAG} dedupe`;
    await notifyMany([r1, r1, r1], {
      type: "announcement.created",
      message: msg,
      actor: { id: actorId, name: "Actor" },
    });
    const rows = await db.notification.findMany({ where: { message: msg } });
    expect(rows.length).toBe(1);
  });

  it("no-ops cleanly when the only recipient is the actor", async () => {
    const msg = `${TAG} selfonly`;
    await notifyMany([actorId], {
      type: "announcement.created",
      message: msg,
      actor: { id: actorId, name: "Actor" },
    });
    const rows = await db.notification.findMany({ where: { message: msg } });
    expect(rows.length).toBe(0);
  });
});

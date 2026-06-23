import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, adminDb } from "@/lib/db";
import { runWithTenant, runUnscoped } from "@/lib/tenantContext";

// Validates the tenant-scoping Prisma extension (lib/db.ts) — the core isolation
// control. Creates two throwaway tenants with a user each, then asserts the
// scoped client only ever sees the active tenant's rows, fails closed without a
// context, injects tenantId on create, and that $transaction inherits scoping.

const A = "itest_tenant_a";
const B = "itest_tenant_b";

async function seedTenant(id: string, email: string) {
  await adminDb.tenant.upsert({
    where: { id },
    update: {},
    create: { id, subdomain: id, name: id },
  });
  await adminDb.user.upsert({
    where: { tenantId_email: { tenantId: id, email } },
    update: {},
    create: {
      tenantId: id,
      email,
      passwordHash: "x",
      name: "T",
      title: "T",
      department: "Executive",
    },
  });
}

beforeAll(async () => {
  await seedTenant(A, "a@itest.local");
  await seedTenant(B, "b@itest.local");
});

afterAll(async () => {
  // Cascade deletes the users via the tenant FK.
  await adminDb.tenant.deleteMany({ where: { id: { in: [A, B] } } });
  await adminDb.$disconnect();
});

describe("tenant-scoping extension", () => {
  it("fails closed: a scoped query with no tenant context throws", async () => {
    await expect(db.user.count()).rejects.toThrow(/no tenant context/i);
  });

  it("scopes findMany/count to the active tenant", async () => {
    const aCount = await runWithTenant(A, () =>
      db.user.count({ where: { email: "a@itest.local" } }),
    );
    const bSeesA = await runWithTenant(B, () =>
      db.user.count({ where: { email: "a@itest.local" } }),
    );
    expect(aCount).toBe(1);
    expect(bSeesA).toBe(0); // B cannot see A's user even by email
  });

  it("findUnique works with AND-injected tenantId and isolates cross-tenant", async () => {
    const aUser = await runWithTenant(A, () => db.user.findFirst());
    expect(aUser?.tenantId).toBe(A);

    // Same id, queried from tenant B → null (the AND filter excludes it).
    const cross = await runWithTenant(B, () =>
      db.user.findUnique({ where: { id: aUser!.id } }),
    );
    expect(cross).toBeNull();

    // Same id from tenant A → found.
    const same = await runWithTenant(A, () =>
      db.user.findUnique({ where: { id: aUser!.id } }),
    );
    expect(same?.id).toBe(aUser!.id);
  });

  it("injects tenantId on create", async () => {
    const board = await runWithTenant(A, () =>
      db.board.create({ data: { name: "itest-board" } as any }),
    );
    expect(board.tenantId).toBe(A);
    await adminDb.board.delete({ where: { id: board.id } });
  });

  it("$transaction inherits tenant scoping", async () => {
    const [count, board] = await runWithTenant(A, () =>
      db.$transaction(async (tx) => {
        const c = await tx.user.count();
        const b = await tx.board.create({ data: { name: "itest-tx" } as any });
        return [c, b] as const;
      }),
    );
    expect(count).toBe(1); // only A's user
    expect(board.tenantId).toBe(A); // create inside tx still injected
    await adminDb.board.delete({ where: { id: board.id } });
  });

  it("bypass / runUnscoped sees across tenants", async () => {
    const all = await runUnscoped(() =>
      db.user.count({ where: { email: { in: ["a@itest.local", "b@itest.local"] } } }),
    );
    expect(all).toBe(2);
  });

  // ── Destructive ops must NOT reach across tenants ──────────────────────────
  // The highest-stakes property: a bulk update/delete issued by tenant B must
  // never touch tenant A's rows, even when the where matches A's data.

  it("updateMany cannot modify another tenant's rows", async () => {
    // From B, try to rename every user — must affect 0 of A's rows.
    const res = await runWithTenant(B, () =>
      db.user.updateMany({ data: { title: "HACKED" } }),
    );
    // B has exactly its own one user; A's is untouched.
    expect(res.count).toBe(1);
    const aUser = await runWithTenant(A, () =>
      db.user.findFirst({ where: { email: "a@itest.local" } }),
    );
    expect(aUser?.title).not.toBe("HACKED"); // A survived B's bulk update
  });

  it("deleteMany cannot delete another tenant's rows", async () => {
    // A throwaway board in A that B will try (and fail) to delete.
    const board = await runWithTenant(A, () =>
      db.board.create({ data: { tenantId: A, name: "itest-del" } as any }),
    );
    const res = await runWithTenant(B, () =>
      db.board.deleteMany({ where: { name: "itest-del" } }),
    );
    expect(res.count).toBe(0); // B deleted nothing of A's
    const stillThere = await runWithTenant(A, () =>
      db.board.findUnique({ where: { id: board.id } }),
    );
    expect(stillThere?.id).toBe(board.id); // A's board survived
    await adminDb.board.delete({ where: { id: board.id } });
  });

  // ── upsert: where is tenant-scoped, create is stamped ──────────────────────

  it("upsert won't update another tenant's row through a matching unique key", async () => {
    // A owns a board with a known id.
    const id = "itest-upsert-A";
    await runWithTenant(A, () =>
      db.board.create({ data: { id, tenantId: A, name: "A original" } as any }),
    );

    // B upserts that SAME id. Because the upsert.where is tenant-scoped, B does
    // NOT resolve to A's row — it takes the CREATE path for its own tenant. A's
    // row must be left exactly as it was (not hijacked by B's update branch).
    // (The PK is global, so B's create uses a different id; the point is B's
    // upsert never UPDATES A's row.)
    const b = await runWithTenant(B, () =>
      db.board.upsert({
        where: { id: "itest-upsert-B" },
        create: { id: "itest-upsert-B", name: "B board" } as any,
        update: { name: "B HIJACK" },
      }),
    );
    expect(b.tenantId).toBe(B); // create path → B's tenant stamped

    const aRow = await runWithTenant(A, () =>
      db.board.findUnique({ where: { id } }),
    );
    expect(aRow?.name).toBe("A original"); // untouched by B's upsert

    // And A re-upserting its own id hits the UPDATE path (where resolves to it).
    const aUpd = await runWithTenant(A, () =>
      db.board.upsert({
        where: { id },
        create: { id, name: "A original" } as any,
        update: { name: "A updated" },
      }),
    );
    expect(aUpd.name).toBe("A updated");
    expect(aUpd.tenantId).toBe(A);

    await adminDb.board.deleteMany({
      where: { id: { in: ["itest-upsert-A", "itest-upsert-B"] } },
    });
  });

  // ── createMany stamps every row ────────────────────────────────────────────

  it("createMany injects tenantId into every row", async () => {
    await runWithTenant(A, () =>
      db.board.createMany({
        data: [{ name: "cm-1" }, { name: "cm-2" }] as any,
      }),
    );
    const mine = await runWithTenant(A, () =>
      db.board.findMany({ where: { name: { in: ["cm-1", "cm-2"] } } }),
    );
    expect(mine).toHaveLength(2);
    expect(mine.every((b) => b.tenantId === A)).toBe(true);
    // B sees none of them.
    const bSees = await runWithTenant(B, () =>
      db.board.count({ where: { name: { in: ["cm-1", "cm-2"] } } }),
    );
    expect(bSees).toBe(0);
    await adminDb.board.deleteMany({ where: { name: { in: ["cm-1", "cm-2"] } } });
  });

  // ── Nested writes: child rows hang off a scoped parent ─────────────────────
  // Child models (BoardList) carry no tenantId; they inherit tenancy through the
  // scoped Board. A nested create under a scoped parent must land in the right
  // tenant and be invisible to the other.

  it("nested write under a scoped parent stays in-tenant", async () => {
    const board = await runWithTenant(A, () =>
      db.board.create({
        data: {
          tenantId: A,
          name: "itest-nested",
          lists: { create: [{ name: "List 1", position: 1 }] },
        } as any,
        include: { lists: true },
      }),
    );
    expect(board.tenantId).toBe(A);
    expect(board.lists).toHaveLength(1);

    // The list is reachable from A through its board, and B's board query can't
    // see the parent at all.
    const bSees = await runWithTenant(B, () =>
      db.board.count({ where: { name: "itest-nested" } }),
    );
    expect(bSees).toBe(0);
    await adminDb.board.delete({ where: { id: board.id } }); // cascades the list
  });

  // ── The constraint login relies on: email is unique PER tenant ─────────────

  it("the same email can exist in two tenants (per-tenant unique)", async () => {
    const shared = "dupe@itest.local";
    await seedTenant(A, shared); // A already exists; adds the user
    await seedTenant(B, shared);

    const inA = await runWithTenant(A, () =>
      db.user.findUnique({ where: { tenantId_email: { tenantId: A, email: shared } } }),
    );
    const inB = await runWithTenant(B, () =>
      db.user.findUnique({ where: { tenantId_email: { tenantId: B, email: shared } } }),
    );
    expect(inA?.tenantId).toBe(A);
    expect(inB?.tenantId).toBe(B);
    expect(inA!.id).not.toBe(inB!.id); // distinct rows, same email

    // And login's scoped lookup in tenant A can't see B's identically-named user.
    const aSeesOnlyOwn = await runWithTenant(A, () =>
      db.user.findMany({ where: { email: shared } }),
    );
    expect(aSeesOnlyOwn).toHaveLength(1);
    expect(aSeesOnlyOwn[0].tenantId).toBe(A);
  });
});

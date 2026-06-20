import { describe, it, expect, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { rateLimit } from "@/lib/rateLimit";

// Locks in the limiter's two non-negotiable properties:
//   1. it actually blocks past the limit, and
//   2. the increment is ATOMIC under concurrency (no under-counting that would
//      let an attacker slip extra requests through a race).

const db = new PrismaClient();
const TAG = "itest:rl";

afterAll(async () => {
  await db.rateLimit.deleteMany({ where: { bucket: { startsWith: TAG } } });
  await db.$disconnect();
});

describe("rateLimit", () => {
  it("allows up to the limit, then blocks", async () => {
    const bucket = `${TAG}:seq:${process.hrtime.bigint()}`;
    const results: boolean[] = [];
    for (let i = 0; i < 8; i++) {
      const r = await rateLimit(bucket, 5, 600_000);
      results.push(r.ok);
    }
    expect(results.filter(Boolean).length).toBe(5); // first 5 allowed
    expect(results.slice(5)).toEqual([false, false, false]); // rest blocked
  });

  it("reports remaining + retryAfter", async () => {
    const bucket = `${TAG}:meta:${process.hrtime.bigint()}`;
    const first = await rateLimit(bucket, 3, 600_000);
    expect(first.ok).toBe(true);
    expect(first.remaining).toBe(2);
    expect(first.retryAfter).toBeGreaterThan(0);
  });

  it("is atomic under concurrency — 10 parallel hits get distinct counts 1..10", async () => {
    const bucket = `${TAG}:par:${process.hrtime.bigint()}`;
    const limit = 5;
    const outcomes = await Promise.all(
      Array.from({ length: 10 }, () => rateLimit(bucket, limit, 600_000)),
    );
    // Exactly `limit` should be allowed; no double-counting means the final
    // stored count is 10 (one increment per call).
    const allowed = outcomes.filter((o) => o.ok).length;
    expect(allowed).toBe(limit);
    const row = await db.rateLimit.findFirst({ where: { bucket } });
    expect(row?.count).toBe(10);
  });

  it("separate buckets do not interfere", async () => {
    const a = `${TAG}:a:${process.hrtime.bigint()}`;
    const b = `${TAG}:b:${process.hrtime.bigint()}`;
    await rateLimit(a, 1, 600_000); // exhaust a
    const aBlocked = await rateLimit(a, 1, 600_000);
    const bOk = await rateLimit(b, 1, 600_000);
    expect(aBlocked.ok).toBe(false);
    expect(bOk.ok).toBe(true);
  });
});

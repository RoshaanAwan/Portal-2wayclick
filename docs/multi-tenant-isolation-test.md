# Multi-tenant isolation — test case

This documents the test that guards the tenant-isolation boundary, so the
security property — *one tenant can never read or write another tenant's data* —
is regression-proof.

The control under test is the Prisma client extension in [`lib/db.ts`](../lib/db.ts):
the scoped `db` auto-injects `tenantId` into every query against a tenant-root
model and **fails closed** (throws) when no tenant context is set. Because
isolation lives in the client (not at each of ~380 call sites), one test file can
exercise the whole boundary.

## How to run

```bash
# Just this test (12 cases):
npx vitest run --config vitest.integration.config.ts lib/__tests__/tenantScope.itest.ts

# Full DB-backed suite (33 cases, includes this one):
npm run test:integration
```

Needs a local Postgres via `DATABASE_URL` (it's an integration test, `*.itest.ts`).
It is self-contained: `beforeAll` seeds two throwaway tenants (`itest_tenant_a`,
`itest_tenant_b`), `afterAll` cascade-deletes them. No app server required.

Test file: [`lib/__tests__/tenantScope.itest.ts`](../lib/__tests__/tenantScope.itest.ts)

## What it asserts

Two tenants **A** and **B**, each with one user. Every case drives the scoped
`db` from inside `runWithTenant(...)` and asserts the active tenant only ever
sees / touches its own rows.

| # | Case | Property proven |
|---|------|-----------------|
| 1 | fail-closed with no context | A scoped query with no tenant context **throws** (`/no tenant context/`) — a missing scope can't silently leak everyone's rows. |
| 2 | `findMany` / `count` scoped | A's count is its own; B counting A's email returns **0**. |
| 3 | `findUnique` cross-tenant isolation | A's row queried by id **from B → `null`**; from A → found. (Proves the tenantId is merged as a sibling of the unique key, not dropped.) |
| 4 | `create` injects tenantId | A board created in A is stamped `tenantId = A`. |
| 5 | `$transaction` inherits scoping | Inside a `db.$transaction`, both reads and a nested create stay scoped to A. |
| 6 | `bypass` / `runUnscoped` | Platform-admin bypass sees across tenants (the deliberate escape hatch). |
| 7 | `updateMany` can't cross tenants | A bulk update from B (matching where) affects **0** of A's rows; A's data survives. |
| 8 | `deleteMany` can't cross tenants | A bulk delete from B removes **0** of A's rows; A's board survives. |
| 9 | `upsert` where is scoped | B's upsert on a matching key can't hijack A's row via the update branch; create stamps B's tenant; A re-upserting its own id hits update. |
| 10 | `createMany` stamps every row | Batch inserts all land in A; B sees none of them. |
| 11 | nested write stays in-tenant | A nested `lists: { create }` under a Board inherits the parent's tenant; invisible to B. (Child models carry no `tenantId` — they inherit via the scoped parent.) |
| 12 | per-tenant email uniqueness | The **same email** exists as **distinct rows** in A and B (`@@unique([tenantId, email])`); A's scoped lookup sees only its own — the constraint login relies on. |

Cases 7–9 are the highest-stakes: a bulk `update`/`delete`/`upsert` is where a
single un-scoped query would do the most cross-tenant damage.

## Out of scope here (covered by an E2E test instead)

Two behaviors depend on `next/headers` `cookies()`, which isn't available in the
Vitest Node environment, so they belong to an HTTP-level test, not this one:

- **Session-cookie fallback** — `currentRequestTenantId` ([`lib/tenant.ts`](../lib/tenant.ts))
  scopes a plain server component from the session cookie when no
  `runWithTenant` context is active.
- **Cross-subdomain rejection** — `getCurrentUser` rejects a session whose tenant
  doesn't match the request's subdomain.

These were verified manually during the build with a two-tenant HTTP smoke test
(per-tenant login with the same email, data isolation, cross-subdomain rejection,
suspend, and per-tenant branding — all passed). See [`multi-tenant`](../../.claude/projects/-home-dev-2wayclick-Project-portal/memory/multi-tenant.md)
notes for the architecture. A committed E2E harness for those two behaviors is a
possible follow-up.

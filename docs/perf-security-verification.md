# Backend performance + security hardening — verification record

This documents the audit-driven hardening pass and the evidence backing each
change, so the work is reproducible and the security gates are regression-proof.

## How to run the tests

```bash
npm test               # unit tests (pure logic, no DB) — fast, run anywhere
npm run test:integration  # DB-backed tests (needs DATABASE_URL → local Postgres)
npm run test:all          # both
```

- Unit: `lib/**/*.test.ts` (Vitest, node env).
- Integration: `lib/**/*.itest.ts` — exercise real Prisma/Postgres logic and
  clean up the rows they create. `server-only` is stubbed for the Node runner
  (see `vitest.integration.config.ts`).

## Security

### CRITICAL — cross-project task IDOR (closed + regression-locked)
`lib/taskAccess.ts` (`assertTaskAccess` / `assertListAccess`) gates all 7 task
write routes (create, move, update, assign, unassign, comment, delete). A board
with a project is members-only (admin tier bypasses); the project-less global
`/tasks` board stays open.

Locked in by `lib/__tests__/taskAccess.itest.ts` (10 tests):
- non-member → **403**, member/admin/owner-as-member → allowed
- global board → allowed for any authenticated user
- missing task/list → **404**

### HIGH — leave-decision IDOR
`app/api/requests/decide/route.ts` now scopes a non-admin decider to
`reviewerId === user.id || owner.managerId === user.id` (admins bypass),
matching the `/requests` page. Self-owner guard retained.

### HIGH — Slack-link authority bypass
`app/api/admin/users/slack/route.ts` now uses `canManageUser(actor, target)`
(selects `target.role`), so a plain ADMIN can't rewrite a SUPER_ADMIN's (or
their own) Slack identity. Hierarchy locked in by `permissions.test.ts`.

### HIGH — rate limiting (all public/token routes)
Postgres-backed fixed-window limiter `lib/rateLimit.ts` (`RateLimit` model),
applied to: login (per-IP + per-email), qr create/claim/status/link-signin,
the 3 `shared/[token]/*` mutations, `invoices/pay/[token]`, and the Slack
webhook. Atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING count`; fails OPEN.

Locked in by `lib/__tests__/rateLimit.itest.ts` (4 tests) — including a
10-parallel concurrency test proving the increment never under-counts.

### MED/LOW
- Documents create/edit/delete gated on `can.manageDocuments` (API + UI).
- Login: identical generic 401 for unknown-email / wrong-password / disabled
  (no enumeration oracle), **plus** a dummy bcrypt on the unknown-email path so
  response timing doesn't leak account existence. Errors are logged.
- `documents/create` URL restricted to `http(s):` / `data:` (blocks
  `javascript:`); the `data:` upload fallback still works.

## Performance

### Conversation-list N+1 → single grouped query
`lib/messaging.ts` replaced N per-conversation `COUNT`s with one query joining
each member's `lastReadAt`. Equivalence locked in by
`lib/__tests__/messaging.itest.ts` (4 tests) — asserts the new count equals the
old per-conversation COUNT, including the "not my own message" rule.

### Batched announcement fan-out
`notifyMany` → one `createMany` + one batched push lookup. Correctness locked in
by `lib/__tests__/notifyMany.itest.ts` (3 tests): one row per recipient, actor
dropped, fields correct, de-dup, self-only no-op.

### Indexes (migration `perf_indexes`) — query plans verified
`EXPLAIN ANALYZE` (dev) confirms the planner uses each new index for its hot
query (forced with `enable_seqscan=off` because dev tables are tiny; at prod
volume the planner picks them unaided):

| Query | Index used |
|---|---|
| `messages/since` (createdAt > cursor) | `Index Scan using Message_createdAt_idx` |
| Expense approval queue (status + createdAt) | `Index Scan Backward using Expense_status_createdAt_idx` |
| LeaveRequest my-requests (ownerId + createdAt) | `Index Scan Backward using LeaveRequest_ownerId_createdAt_idx` |

`Backward` = the `ORDER BY … DESC` is served by the index, no separate sort.

### Poller load reduction
- `notifications/since` recomputes the unread `count()` only on new rows or a
  ~30s reconcile (client sends `?reconcile=1`).
- The conversation-list reconcile is gated to when the `/messages` UI is open;
  the lightweight message poll keeps the sidebar badge live app-wide.

### Over-fetch
`/projects/[id]` board now caps comments per card at 50 (newest-first + reverse),
matching `/tasks`.

## Known remaining items (intentionally deferred)
- `/tasks` still eager-loads the full user roster (bounded by company size).
  Deferring to an on-demand fetch is a client refactor with real regression
  risk; low impact relative to the per-card comment fix already shipped.
- Rate limiting fails OPEN by design (availability over strictness).
- The QR `DIRECT_LINK` token-leak vector is mitigated (rate-limited, short TTL,
  noindex), not eliminated — it's an inherent design tradeoff.
- This is a static + test-backed pass, not an external pentest.

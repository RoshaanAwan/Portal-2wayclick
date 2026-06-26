import "server-only";
import { AsyncLocalStorage } from "async_hooks";

// ── Per-request tenant context ────────────────────────────────────────────────
// The single source of truth for "which tenant is this request for". Established
// once per request at an entry point (the (app) layout, a withTenant() route
// wrapper, or a public token route that resolves tenant from the row), and read
// by the Prisma client extension in lib/db.ts to auto-scope every query.
//
// Isolation is therefore a property of the *client*, not of each of the ~380
// call sites — a forgotten filter can't leak another tenant's rows, because the
// scoped client always injects the active tenantId. A MISSING context fails
// CLOSED: scoped queries throw (see lib/db.ts), surfacing as a loud error rather
// than silently returning everyone's data.

export interface TenantContext {
  tenantId: string;
  /** Platform-admin escape hatch: when true, the extension skips scoping. */
  bypass?: boolean;
}

export const tenantStore = new AsyncLocalStorage<TenantContext>();

/** The active tenantId, or null when no context is set (e.g. login, platform). */
export function getTenantId(): string | null {
  return tenantStore.getStore()?.tenantId ?? null;
}

/**
 * The active tenantId, throwing if none is set. Use in shared writers (audit,
 * notifications, activity) that must stamp tenantId into a create — it both
 * satisfies Prisma's required-tenantId create type and fails loudly if called
 * outside a tenant context (a bug). The extension would inject anyway at
 * runtime, but passing it explicitly keeps the types honest.
 */
export function requireTenantId(): string {
  const id = tenantStore.getStore()?.tenantId;
  if (!id) {
    throw new Error(
      "[tenant] requireTenantId() called with no tenant context.",
    );
  }
  return id;
}

/** True when running inside a platform-admin bypass context. */
export function isBypass(): boolean {
  return tenantStore.getStore()?.bypass === true;
}

/**
 * Resolve the active tenantId the SAME way the scoped Prisma client does
 * (lib/db.ts): prefer the ALS store, else fall back to the request's
 * session-cookie tenant. Throws only if BOTH are absent.
 *
 * Why this exists: in API route handlers the ALS store set by getCurrentUser's
 * enterWith() does NOT propagate back to the handler's async context (enterWith
 * inside React.cache mutates a different context), so requireTenantId() — which
 * reads the store directly — throws "no tenant context". The db extension never
 * hit this because it already has the cookie fallback; the shared writers
 * (notify/notifyMany/recordActivity) did not, so they silently failed in every
 * route. Use this in any best-effort writer that runs inside a request handler.
 */
export async function resolveTenantId(): Promise<string> {
  const fromStore = tenantStore.getStore()?.tenantId;
  if (fromStore) return fromStore;
  // Lazy import so this module stays usable in non-request contexts.
  const { currentRequestTenantId } = await import("./tenant");
  const fromRequest = await currentRequestTenantId();
  if (fromRequest) return fromRequest;
  throw new Error(
    "[tenant] resolveTenantId(): no tenant context and no session-cookie tenant.",
  );
}

/**
 * Set the active tenant for the CURRENT async execution and everything it goes
 * on to await — without wrapping a callback. Used by getCurrentUser()/auth so a
 * server component or route handler that simply calls an auth helper ends up
 * with the store established for the rest of the request. Idempotent: a no-op if
 * the same tenant is already active.
 *
 * Uses AsyncLocalStorage.enterWith, which (unlike run) mutates the store for the
 * current context in place — the right tool when there's no single callback to
 * wrap (Next server components).
 */
export function enterTenant(tenantId: string): void {
  const cur = tenantStore.getStore();
  if (cur?.tenantId === tenantId && !cur?.bypass) return;
  tenantStore.enterWith({ tenantId });
}

/**
 * Run `fn` with the given tenant active. All scoped Prisma queries inside (and
 * in anything it awaits) are filtered to this tenant. Use at every request
 * entry point.
 *
 * IMPORTANT: the returned promise is created and awaited INSIDE the ALS scope.
 * `AsyncLocalStorage.run(store, fn)` only keeps `store` active while `fn` runs;
 * if `fn` merely *returned* an un-awaited Prisma promise, that promise's
 * continuation would resolve after `run` exited and lose the store (the bug this
 * wrapper exists to prevent). Passing an async `fn` and awaiting here keeps the
 * store alive for the whole chain.
 */
export function runWithTenant<T>(
  tenantId: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  return tenantStore.run({ tenantId }, async () => fn());
}

/**
 * Run `fn` with tenant scoping DISABLED — for platform-admin/cross-tenant work
 * only, always behind requireSystemOwner(). Prefer adminDb (lib/db.ts) for
 * one-off un-scoped reads; use this when a code path must call shared
 * tenant-aware helpers without their scoping.
 */
export function runUnscoped<T>(fn: () => Promise<T> | T): Promise<T> {
  // A tenantId is required by the type but ignored when bypass is set.
  return tenantStore.run({ tenantId: "__bypass__", bypass: true }, async () =>
    fn(),
  );
}

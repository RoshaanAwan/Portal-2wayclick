import { PrismaClient } from "@prisma/client";
import { tenantStore } from "./tenantContext";

// ── Tenant-scoped Prisma client ───────────────────────────────────────────────
// `db` is a $extends-wrapped client that AUTO-INJECTS the active tenantId (from
// the AsyncLocalStorage context in lib/tenantContext.ts) into every query
// against a tenant-root model. This makes tenant isolation a property of the
// client, so the ~380 call sites don't each have to remember `where: {tenantId}`
// — and a miss fails CLOSED (throws) instead of leaking another tenant's rows.
//
// `adminDb` is the un-extended base client, for platform-admin/cross-tenant work
// (behind requireSystemOwner) and migrations/seed. Never use it in normal
// tenant request paths.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const base =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = base;

/** Un-extended client. Platform-admin / migration / seed use ONLY. */
export const adminDb = base;

// The tenant-root models that carry a `tenantId` column (must match the schema).
// Child models (Task comments, messages, list items, …) inherit tenancy through
// a scoped parent relation and are deliberately NOT here — scoping them would
// inject a non-existent column. Keep this in sync with prisma/schema.prisma.
const SCOPED_MODELS = new Set<string>([
  "User",
  "Session",
  "LoginTicket",
  "Announcement",
  "Document",
  "LeaveRequest",
  "Attendance",
  "AttendanceBreak",
  "Activity",
  "AuditLog",
  "Board",
  "Project",
  "Conversation",
  "Task",
  "Notification",
  "PushSubscription",
  "Invoice",
  "Expense",
  "ExpenseCategory",
  "UserSalary",
  "BrandingSettings",
  "Integration",
  "GoogleDriveConnection",
]);

// where-ops that take a NON-unique filter (WhereInput) — safe to AND-combine.
const WHERE_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "updateMany",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

// where-ops that take a UNIQUE selector (WhereUniqueInput). Prisma's extended
// unique-where (GA since v5) allows extra non-unique fields ALONGSIDE the unique
// selector, but they must be SIBLINGS — wrapping in `AND` drops the unique key
// and Prisma rejects it. So merge tenantId as a sibling instead.
const UNIQUE_WHERE_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "update",
  "delete",
]);

function withTenantWhere(where: unknown, tenantId: string) {
  // AND-combine so we never clobber an existing where.
  return { AND: [where ?? {}, { tenantId }] };
}

/**
 * Mutates `args` in place to scope a single operation to `tenantId`.
 * - non-unique reads/updateMany/deleteMany/count/aggregate/groupBy → AND into `where`
 * - unique findUnique/update/delete → merge tenantId as a sibling of the unique key
 * - create / createMany → inject `tenantId` into `data`
 * - upsert → inject into `where` (sibling), `create`, and leave `update`
 */
function injectTenant(operation: string, args: any, tenantId: string) {
  if (UNIQUE_WHERE_OPS.has(operation)) {
    args.where = { ...(args.where ?? {}), tenantId };
    return;
  }
  if (WHERE_OPS.has(operation)) {
    args.where = withTenantWhere(args.where, tenantId);
    return;
  }
  if (operation === "create") {
    const data = args.data ?? {};
    const hasTenantRelationField =
      data.tenant != null &&
      typeof data.tenant === "object" &&
      ["connect", "create", "connectOrCreate", "createMany"].some(
        (key) => key in data.tenant,
      );
    if (hasTenantRelationField || "tenantId" in data) {
      return;
    }
    args.data = { ...data, tenantId };
    return;
  }
  if (operation === "createMany") {
    const rows = args.data;
    args.data = Array.isArray(rows)
      ? rows.map((r: any) => ({ ...r, tenantId }))
      : { ...(rows ?? {}), tenantId };
    return;
  }
  if (operation === "upsert") {
    // upsert.where is a unique selector → sibling-merge (not AND).
    args.where = { ...(args.where ?? {}), tenantId };
    args.create = { ...(args.create ?? {}), tenantId };
    // `update` doesn't need tenantId (the row is already tenant-bound), and the
    // where above guarantees we only ever upsert our own row.
    return;
  }
  // Any other op (e.g. raw) isn't auto-scoped; callers must handle it.
}

// Fallback tenant resolver: when there's no explicit AsyncLocalStorage context
// (the common case for a server component / route that just called
// getCurrentUser), resolve the tenant from the request's SESSION COOKIE. This is
// loaded lazily so lib/db.ts stays importable in non-request contexts (scripts,
// tests) where next/headers isn't available. React.cache (inside the resolver)
// makes it one lookup per request, shared across the whole RSC tree — which an
// enterWith() side-effect is not.
async function resolveTenantFromRequest(): Promise<string | null> {
  try {
    const mod = await import("./tenant");
    return await mod.currentRequestTenantId();
  } catch {
    return null;
  }
}

export const db = base.$extends({
  name: "tenant-scope",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!model || !SCOPED_MODELS.has(model)) {
          return query(args);
        }
        const ctx = tenantStore.getStore();
        // Platform-admin bypass: run un-scoped.
        if (ctx?.bypass) {
          return query(args);
        }
        // Explicit context (runWithTenant / a token route) wins. Otherwise fall
        // back to the request's session-cookie tenant so a plain server
        // component is scoped without each one calling runWithTenant.
        let tenantId = ctx?.tenantId ?? null;
        if (!tenantId) {
          tenantId = await resolveTenantFromRequest();
        }
        // FAIL CLOSED: still no tenant → a context-less call (a bug, or platform
        // work that should use adminDb). Throw rather than risk a cross-tenant
        // leak — caught loudly instead of returning everyone's rows.
        if (!tenantId) {
          throw new Error(
            `[tenant] ${model}.${operation} ran with no tenant context. ` +
              `Wrap the request in runWithTenant()/withTenant() or use adminDb for platform work.`,
          );
        }
        injectTenant(operation, args, tenantId);
        return query(args);
      },
    },
  },
});

export type Db = typeof db;

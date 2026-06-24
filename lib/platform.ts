import "server-only";
import { adminDb } from "./db";
import { hashPassword } from "./auth";
import { runWithTenant } from "./tenantContext";

// ── Platform (cross-tenant) operations ────────────────────────────────────────
// Used ONLY by the System Owner area, always behind requireSystemOwner.
// These deliberately use adminDb (the un-scoped client) because they operate
// across tenant boundaries — listing all tenants, provisioning a new one, etc.

const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
// "system" is the reserved tenant holding System Owner accounts — never a
// customer workspace, never routable.
const RESERVED = new Set([
  "www",
  "app",
  "admin",
  "api",
  "default",
  "localhost",
  "system",
]);

/** The reserved tenant id that holds System Owner accounts (no business data). */
export const SYSTEM_TENANT_ID = "system";

export function isValidSubdomain(s: string): boolean {
  return SUBDOMAIN_RE.test(s) && !RESERVED.has(s);
}

/** Every CUSTOMER tenant with a headcount summary, newest first. Excludes the
 *  reserved "system" tenant so it never appears in the management UI. Each row
 *  also carries `companyOwnerId`: the id of the tenant's first SUPER_ADMIN
 *  (its Company Owner), used to drive the "Enter as Company Owner" impersonate
 *  action — null when the tenant has no such user. */
export async function listTenants() {
  const tenants = await adminDb.tenant.findMany({
    where: { id: { not: SYSTEM_TENANT_ID } },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { users: true } },
      users: {
        where: { role: "SUPER_ADMIN", isSystemOwner: false },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { id: true },
      },
    },
  });
  return tenants.map((t) => ({
    id: t.id,
    name: t.name,
    subdomain: t.subdomain,
    status: t.status,
    suspendedAt: t.suspendedAt,
    createdAt: t.createdAt,
    userCount: t._count.users,
    companyOwnerId: t.users[0]?.id ?? null,
  }));
}

export interface NewTenantInput {
  name: string;
  subdomain: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}

/**
 * Provision a tenant in one transaction: the Tenant row, its first SUPER_ADMIN
 * user, and a default Board so /tasks works on first login. Returns the tenant.
 * Throws "SUBDOMAIN_TAKEN" if the subdomain already exists.
 */
export async function createTenant(input: NewTenantInput) {
  const existing = await adminDb.tenant.findUnique({
    where: { subdomain: input.subdomain },
  });
  if (existing) throw new Error("SUBDOMAIN_TAKEN");

  const passwordHash = await hashPassword(input.adminPassword);

  const tenant = await adminDb.tenant.create({
    data: { name: input.name, subdomain: input.subdomain },
  });

  // The first admin + a starter board are created inside the new tenant's
  // context so the scoped writes (and any nested defaults) stamp the right id.
  await runWithTenant(tenant.id, async () => {
    await adminDb.user.create({
      data: {
        tenantId: tenant.id,
        email: input.adminEmail.toLowerCase(),
        passwordHash,
        name: input.adminName,
        title: "Administrator",
        department: "Executive",
        role: "SUPER_ADMIN",
      },
    });
    await adminDb.board.create({
      data: { tenantId: tenant.id, name: "Tasks", keyPrefix: "TASK" },
    });
  });

  return tenant;
}

/** Update a tenant's name and/or subdomain. Throws SUBDOMAIN_TAKEN or SUBDOMAIN_INVALID. */
export async function updateTenant(
  tenantId: string,
  input: { name: string; subdomain: string },
) {
  if (!isValidSubdomain(input.subdomain)) throw new Error("SUBDOMAIN_INVALID");
  const conflict = await adminDb.tenant.findUnique({
    where: { subdomain: input.subdomain },
  });
  if (conflict && conflict.id !== tenantId) throw new Error("SUBDOMAIN_TAKEN");
  return adminDb.tenant.update({
    where: { id: tenantId },
    data: { name: input.name, subdomain: input.subdomain },
  });
}

/** Suspend (block at middleware) or reactivate a tenant. */
export async function setTenantStatus(
  tenantId: string,
  status: "active" | "suspended",
) {
  return adminDb.tenant.update({
    where: { id: tenantId },
    data: {
      status,
      suspendedAt: status === "suspended" ? new Date() : null,
    },
  });
}

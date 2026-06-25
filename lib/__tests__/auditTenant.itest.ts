import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { db, adminDb } from "@/lib/db";
import { runWithTenant } from "@/lib/tenantContext";
import { audit } from "@/lib/audit";
import * as tenantMod from "@/lib/tenant";

// Reproduces the production symptom: CRUD audit rows never land, only auth.login
// does. Hypothesis: bare audit() (no tenant context on the async branch) throws
// inside requireTenantId() and is swallowed, so no row is written — while the
// login route works because it wraps audit() in runWithTenant().

const TENANT_ID = "itest_audit_tenant";

beforeAll(async () => {
  await adminDb.tenant.upsert({
    where: { id: TENANT_ID },
    create: { id: TENANT_ID, name: "Audit ITest", subdomain: TENANT_ID },
    update: {},
  });
});

afterAll(async () => {
  await adminDb.auditLog.deleteMany({ where: { tenantId: TENANT_ID } });
  await adminDb.tenant.deleteMany({ where: { id: TENANT_ID } });
});

const actor = { id: null, name: "ITest Actor", role: "ADMIN" };

describe("audit() tenant context", () => {
  it("WRITES a row when wrapped in runWithTenant", async () => {
    await runWithTenant(TENANT_ID, () =>
      audit({ actor, action: "task.create", entity: "Task", entityId: "wrapped" }),
    );
    const n = await adminDb.auditLog.count({
      where: { tenantId: TENANT_ID, entityId: "wrapped" },
    });
    expect(n).toBe(1);
  });

  it("drops cleanly (no throw) when there is neither context nor request", async () => {
    // In a bare call with no ALS store AND no request cookie (this harness has
    // neither), audit() can't resolve a tenant, so it logs + returns without
    // throwing. In a real CRUD route the session cookie resolves the tenant, so
    // the row DOES land — that path is covered by the wrapped test above plus the
    // cookie fallback (currentRequestTenantId), which can't run outside a request.
    await expect(
      audit({ actor, action: "task.create", entity: "Task", entityId: "bare" }),
    ).resolves.toBeUndefined();
    const n = await adminDb.auditLog.count({
      where: { tenantId: TENANT_ID, entityId: "bare" },
    });
    expect(n).toBe(0);
  });

  it("WRITES via the session-cookie fallback (the real CRUD-route fix)", async () => {
    // Simulate a real request: no ALS store on this branch (bare audit()), but
    // the session cookie resolves the tenant — exactly what currentRequestTenantId
    // does inside a route handler. This is the path that was broken in prod.
    const spy = vi
      .spyOn(tenantMod, "currentRequestTenantId")
      .mockResolvedValue(TENANT_ID);
    try {
      await audit({
        actor,
        action: "task.create",
        entity: "Task",
        entityId: "cookie-fallback",
      });
    } finally {
      spy.mockRestore();
    }
    const n = await adminDb.auditLog.count({
      where: { tenantId: TENANT_ID, entityId: "cookie-fallback" },
    });
    expect(n).toBe(1);
  });
});

import { describe, it, expect } from "vitest";
import {
  ROLES,
  isSuperAdmin,
  isAdminTier,
  isManagerTier,
  can,
  creatableRoles,
  canCreateUserWithRole,
  canCreateUsers,
  canManageUser,
} from "@/lib/permissions";

// The authorization source of truth. Every route's access control derives from
// these helpers, so locking their behaviour down with tests means an accidental
// edit (e.g. adding a role to a tier) can never silently widen access.

describe("role tiers", () => {
  it("isSuperAdmin only for SUPER_ADMIN", () => {
    expect(isSuperAdmin("SUPER_ADMIN")).toBe(true);
    for (const r of ROLES.filter((r) => r !== "SUPER_ADMIN")) {
      expect(isSuperAdmin(r)).toBe(false);
    }
    expect(isSuperAdmin(null)).toBe(false);
    expect(isSuperAdmin(undefined)).toBe(false);
  });

  it("isAdminTier is exactly {SUPER_ADMIN, ADMIN, HR}", () => {
    // HR was granted full admin-tier access (manage users/projects/finance/
    // integrations/branding/audit log). Billing stays Super-Admin-only.
    expect(isAdminTier("SUPER_ADMIN")).toBe(true);
    expect(isAdminTier("ADMIN")).toBe(true);
    expect(isAdminTier("HR")).toBe(true);
    for (const r of ["LEAD", "PROJECT_MANAGER", "EMPLOYEE", "INTERN"]) {
      expect(isAdminTier(r)).toBe(false);
    }
    expect(isAdminTier(null)).toBe(false);
    expect(isAdminTier("NONSENSE")).toBe(false);
  });

  it("isManagerTier is the 5 elevated roles, not EMPLOYEE/INTERN", () => {
    for (const r of ["SUPER_ADMIN", "ADMIN", "HR", "LEAD", "PROJECT_MANAGER"]) {
      expect(isManagerTier(r)).toBe(true);
    }
    expect(isManagerTier("EMPLOYEE")).toBe(false);
    expect(isManagerTier("INTERN")).toBe(false);
    expect(isManagerTier(null)).toBe(false);
  });
});

describe("can.* capabilities", () => {
  it("manageProjects / manageDocuments / manageFinance are admin-tier only", () => {
    // EMPLOYEE and INTERN must never manage projects/docs/finance — this is the
    // capability the task-route IDOR fix and the documents gate rely on.
    for (const r of ["EMPLOYEE", "INTERN", "LEAD", "PROJECT_MANAGER"]) {
      expect(can.manageDocuments(r)).toBe(false);
      expect(can.manageFinance(r)).toBe(false);
    }
    // HR is admin-tier, so it carries these capabilities too.
    for (const r of ["SUPER_ADMIN", "ADMIN", "HR"]) {
      expect(can.manageProjects(r)).toBe(true);
      expect(can.manageDocuments(r)).toBe(true);
      expect(can.manageFinance(r)).toBe(true);
    }
  });

  it("postAnnouncements / decideLeave are manager-tier", () => {
    expect(can.postAnnouncements("LEAD")).toBe(true);
    expect(can.decideLeave("PROJECT_MANAGER")).toBe(true);
    expect(can.postAnnouncements("EMPLOYEE")).toBe(false);
    expect(can.decideLeave("INTERN")).toBe(false);
  });

  it("viewAuditLog is admin-tier OR project manager", () => {
    expect(can.viewAuditLog("SUPER_ADMIN")).toBe(true);
    expect(can.viewAuditLog("HR")).toBe(true); // admin-tier
    expect(can.viewAuditLog("PROJECT_MANAGER")).toBe(true);
    expect(can.viewAuditLog("LEAD")).toBe(false);
    expect(can.viewAuditLog("EMPLOYEE")).toBe(false);
  });
});

describe("user creation authority", () => {
  it("SUPER_ADMIN can create everyone except another SUPER_ADMIN", () => {
    const roles = creatableRoles("SUPER_ADMIN");
    expect(roles).not.toContain("SUPER_ADMIN");
    for (const r of ["ADMIN", "HR", "LEAD", "PROJECT_MANAGER", "EMPLOYEE", "INTERN"]) {
      expect(roles).toContain(r);
    }
  });

  it("ADMIN cannot create ADMIN or SUPER_ADMIN", () => {
    const roles = creatableRoles("ADMIN");
    expect(roles).not.toContain("SUPER_ADMIN");
    expect(roles).not.toContain("ADMIN");
    expect(roles).toContain("HR");
    expect(roles).toContain("EMPLOYEE");
    expect(canCreateUserWithRole("ADMIN", "ADMIN")).toBe(false);
    expect(canCreateUserWithRole("ADMIN", "EMPLOYEE")).toBe(true);
  });

  it("HR creates the tiers below it, but never HR/ADMIN/SUPER_ADMIN", () => {
    const roles = creatableRoles("HR");
    expect(roles).toEqual(["LEAD", "PROJECT_MANAGER", "EMPLOYEE", "INTERN"]);
    expect(canCreateUsers("HR")).toBe(true);
    expect(canCreateUserWithRole("HR", "HR")).toBe(false);
    expect(canCreateUserWithRole("HR", "ADMIN")).toBe(false);
    expect(canCreateUserWithRole("HR", "EMPLOYEE")).toBe(true);
  });

  it("non-admins can create nobody", () => {
    for (const r of ["LEAD", "PROJECT_MANAGER", "EMPLOYEE", "INTERN", null]) {
      expect(creatableRoles(r)).toEqual([]);
      expect(canCreateUsers(r)).toBe(false);
    }
  });
});

describe("canManageUser — the edit/disable/reset + slack-link gate", () => {
  const A = (id: string, role: string) => ({ id, role });

  it("admin may manage strictly-lower-authority users", () => {
    expect(canManageUser(A("a", "ADMIN"), A("b", "EMPLOYEE"))).toBe(true);
    expect(canManageUser(A("s", "SUPER_ADMIN"), A("a", "ADMIN"))).toBe(true);
    // HR is admin-tier and may manage roles strictly below it…
    expect(canManageUser(A("h", "HR"), A("e", "EMPLOYEE"))).toBe(true);
    expect(canManageUser(A("h", "HR"), A("l", "LEAD"))).toBe(true);
  });

  it("HR may NOT manage another HR, an ADMIN, or a SUPER_ADMIN", () => {
    expect(canManageUser(A("h1", "HR"), A("h2", "HR"))).toBe(false);
    expect(canManageUser(A("h", "HR"), A("a", "ADMIN"))).toBe(false);
    expect(canManageUser(A("h", "HR"), A("s", "SUPER_ADMIN"))).toBe(false);
  });

  it("a plain ADMIN may NOT manage a SUPER_ADMIN or another ADMIN", () => {
    // This is precisely the slack-link bypass that was fixed.
    expect(canManageUser(A("a", "ADMIN"), A("s", "SUPER_ADMIN"))).toBe(false);
    expect(canManageUser(A("a1", "ADMIN"), A("a2", "ADMIN"))).toBe(false);
  });

  it("nobody may manage themselves", () => {
    expect(canManageUser(A("a", "ADMIN"), A("a", "EMPLOYEE"))).toBe(false);
    expect(canManageUser(A("s", "SUPER_ADMIN"), A("s", "SUPER_ADMIN"))).toBe(false);
  });

  it("non-admins may manage nobody", () => {
    expect(canManageUser(A("l", "LEAD"), A("i", "INTERN"))).toBe(false);
    expect(canManageUser(A("p", "PROJECT_MANAGER"), A("e", "EMPLOYEE"))).toBe(false);
    expect(canManageUser(A("e", "EMPLOYEE"), A("i", "INTERN"))).toBe(false);
  });
});

// ── Roles & permissions — single source of truth ────────────────────────────
// The app re-themes its authorization off these helpers instead of scattering
// raw `role === "ADMIN"` string checks. Roles are stored as strings on User
// (Postgres, no native enum needed) and validated against ROLES.

export const ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "HR",
  "LEAD",
  "PROJECT_MANAGER",
  "EMPLOYEE",
] as const;

export type Role = (typeof ROLES)[number];

/** Display labels for each role. */
export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  HR: "HR",
  LEAD: "Lead",
  PROJECT_MANAGER: "Project Manager",
  EMPLOYEE: "Employee",
};

/** A short description shown next to each role in pickers. */
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  SUPER_ADMIN: "Full access to everything, including all audit logs.",
  ADMIN: "Manages users, projects, and company content.",
  HR: "People operations — approvals and announcements.",
  LEAD: "Team lead — approvals, announcements, and projects.",
  PROJECT_MANAGER: "Runs projects and their boards.",
  EMPLOYEE: "Standard member access.",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Badge variant per role for consistent coloring in the UI. */
export const ROLE_BADGE: Record<Role, "accent" | "amber" | "cyan" | "emerald" | "neutral"> = {
  SUPER_ADMIN: "accent",
  ADMIN: "accent",
  HR: "cyan",
  LEAD: "amber",
  PROJECT_MANAGER: "emerald",
  EMPLOYEE: "neutral",
};

// ── Privilege tiers ─────────────────────────────────────────────────────────
// Many features were gated on "ADMIN or MANAGER". We express those as named
// capabilities so adding/removing a role from a capability is a one-line edit.

/** Roles with the elevated "staff" privileges (post, approve leave, etc.). */
const MANAGER_TIER: readonly Role[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "HR",
  "LEAD",
  "PROJECT_MANAGER",
];

/** Roles that can administer the workspace (projects, members). */
const ADMIN_TIER: readonly Role[] = ["SUPER_ADMIN", "ADMIN"];

export function isSuperAdmin(role: string | null | undefined): boolean {
  return role === "SUPER_ADMIN";
}

/** SUPER_ADMIN or ADMIN — can manage projects, create users, see /admin. */
export function isAdminTier(role: string | null | undefined): boolean {
  return !!role && ADMIN_TIER.includes(role as Role);
}

/** Elevated staff — may post announcements and decide leave requests. */
export function isManagerTier(role: string | null | undefined): boolean {
  return !!role && MANAGER_TIER.includes(role as Role);
}

// Named capabilities (read at call sites for clarity). All derive from tiers.
export const can = {
  postAnnouncements: (role?: string | null) => isManagerTier(role),
  /** Edit or delete ANY announcement (not just your own). Admin tier. */
  manageAnnouncements: (role?: string | null) => isAdminTier(role),
  /** Edit or delete ANY document in the library. Admin tier. */
  manageDocuments: (role?: string | null) => isAdminTier(role),
  decideLeave: (role?: string | null) => isManagerTier(role),
  manageProjects: (role?: string | null) => isAdminTier(role),
  manageProjectMembers: (role?: string | null) => isAdminTier(role),
  /** Reach the /admin section (user management). */
  accessAdmin: (role?: string | null) => isAdminTier(role),
  /** View the full audit log — Super Admin, Admin, and Project Manager. */
  viewAuditLog: (role?: string | null) =>
    isAdminTier(role) || role === "PROJECT_MANAGER",
  /** See the whole company's attendance (not just one's own). Manager tier. */
  viewAllAttendance: (role?: string | null) => isManagerTier(role),
};

// ── User-creation authorization ──────────────────────────────────────────────
// Per the spec:
//   • SUPER_ADMIN creates ADMIN (and may create anyone else too).
//   • ADMIN creates HR / LEAD / PROJECT_MANAGER (and EMPLOYEE).
// A creator may never mint a role at or above their own authority.

/** The set of roles a given actor role is allowed to assign when creating a user. */
export function creatableRoles(actorRole: string | null | undefined): Role[] {
  if (isSuperAdmin(actorRole)) {
    // Super Admin can create every role except another Super Admin.
    return ROLES.filter((r) => r !== "SUPER_ADMIN");
  }
  if (actorRole === "ADMIN") {
    return ["HR", "LEAD", "PROJECT_MANAGER", "EMPLOYEE"];
  }
  // Everyone else cannot create users.
  return [];
}

/** Whether `actorRole` may create a user with `targetRole`. */
export function canCreateUserWithRole(
  actorRole: string | null | undefined,
  targetRole: string,
): boolean {
  return creatableRoles(actorRole).includes(targetRole as Role);
}

/** Whether `actorRole` may create users at all. */
export function canCreateUsers(actorRole: string | null | undefined): boolean {
  return creatableRoles(actorRole).length > 0;
}

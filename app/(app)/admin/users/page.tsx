import { ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  creatableRoles,
  canCreateUsers,
  canManageUser,
  ROLES,
  ROLE_LABELS,
} from "@/lib/permissions";
import { DEPARTMENTS } from "@/lib/constants";
import { UsersClient, type AdminUserRow } from "./UsersClient";

export const metadata = { title: "User Management — 2WayClick" };

const PAGE_SIZE = 12;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  if (!canCreateUsers(actor.role)) redirect("/dashboard");

  const sp = await searchParams;
  const query = (sp.q ?? "").trim();

  // Search across name + email, and any role whose label matches the query
  // (so typing "Manager" finds PROJECT_MANAGER even though it's stored as an
  // enum string).
  const where: Prisma.UserWhereInput = {};
  if (query) {
    const lower = query.toLowerCase();
    const matchedRoles = ROLES.filter((r) =>
      ROLE_LABELS[r].toLowerCase().includes(lower),
    );
    where.OR = [
      { name: { contains: query, mode: "insensitive" } },
      { email: { contains: query, mode: "insensitive" } },
      ...(matchedRoles.length ? [{ role: { in: matchedRoles } }] : []),
    ];
  }

  const total = await db.user.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requested = Number.parseInt(sp.page ?? "1", 10);
  const page = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 1), pageCount)
    : 1;

  const users = await db.user.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      title: true,
      department: true,
      avatarUrl: true,
      createdAt: true,
      disabledAt: true,
    },
  });

  const rows: AdminUserRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    title: u.title,
    department: u.department,
    avatarUrl: u.avatarUrl,
    createdAt: u.createdAt.toISOString(),
    disabled: u.disabledAt !== null,
    // Whether the current actor may edit / disable / reset THIS row. Computed
    // server-side so the client never has to re-derive authorization.
    canManage: canManageUser(actor, { id: u.id, role: u.role }),
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="User Management"
        subtitle="Create and manage workspace members and their roles."
        icon={ShieldCheck}
      />
      <UsersClient
        users={rows}
        page={page}
        pageCount={pageCount}
        total={total}
        query={query}
        // The actor only ever sees roles they're permitted to assign.
        assignableRoles={creatableRoles(actor.role)}
        departments={[...DEPARTMENTS]}
      />
    </div>
  );
}

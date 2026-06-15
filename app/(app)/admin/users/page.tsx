import { ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { creatableRoles, canCreateUsers } from "@/lib/permissions";
import { DEPARTMENTS } from "@/lib/constants";
import { UsersClient, type AdminUserRow } from "./UsersClient";

export const metadata = { title: "User Management — 2WayClick" };

export default async function AdminUsersPage() {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  if (!canCreateUsers(actor.role)) redirect("/dashboard");

  const users = await db.user.findMany({
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      title: true,
      department: true,
      avatarUrl: true,
      createdAt: true,
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
        // The actor only ever sees roles they're permitted to assign.
        assignableRoles={creatableRoles(actor.role)}
        departments={[...DEPARTMENTS]}
      />
    </div>
  );
}

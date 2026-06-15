import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, Network } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdminTier } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { DirectoryClient, type DirectoryPerson } from "./DirectoryClient";

export const metadata = {
  title: "Directory — 2WayClick",
};

export default async function DirectoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Directory is admin tier only (Super Admin + Admin). Everyone else is sent
  // back to their dashboard — they can't reach it via URL either.
  if (!isAdminTier(user.role)) redirect("/dashboard");

  const users = await db.user.findMany({
    orderBy: [{ name: "asc" }],
    include: {
      manager: { select: { id: true, name: true } },
      _count: { select: { reports: true } },
    },
  });

  const people: DirectoryPerson[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    title: u.title,
    department: u.department,
    role: u.role,
    location: u.location,
    avatarUrl: u.avatarUrl,
    managerId: u.managerId,
    managerName: u.manager?.name ?? null,
    reportCount: u._count.reports,
  }));

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="People Directory"
        subtitle={`${people.length} people across the 2WayClick team`}
        icon={Users}
        action={
          <Link
            href="/directory/org"
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3.5 py-2 text-sm font-medium text-ink-700 transition hover:border-accent/40 hover:bg-accent-soft hover:text-accent"
          >
            <Network className="h-4 w-4" />
            Org Chart
          </Link>
        }
      />
      <DirectoryClient people={people} />
    </div>
  );
}

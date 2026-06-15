import { Users } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { DirectoryClient, type DirectoryPerson } from "./DirectoryClient";

export const metadata = {
  title: "Directory — 2WayClick",
};

export default async function DirectoryPage() {
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
      />
      <DirectoryClient people={people} />
    </div>
  );
}

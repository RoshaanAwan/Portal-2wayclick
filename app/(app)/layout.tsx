import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Recent activity powers the topbar notifications panel.
  const activities = await db.activity.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { user: true },
  });

  const notifications = activities.map((a) => ({
    id: a.id,
    verb: a.verb,
    target: a.target,
    createdAt: a.createdAt.toISOString(),
    user: { name: a.user.name, avatarUrl: a.user.avatarUrl },
  }));

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="lg:pl-64">
        <Topbar user={user} notifications={notifications} />
        <main className="px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SystemSidebar } from "./SystemSidebar";
import { SystemTopbar } from "./SystemTopbar";

export default async function SystemLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isSystemOwner) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-paper text-ink">
      <SystemSidebar userName={user.name} avatarUrl={user.avatarUrl ?? null} />
      <div className="lg:pl-64">
        <SystemTopbar user={user} />
        <main className="px-4 py-6 lg:px-8">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

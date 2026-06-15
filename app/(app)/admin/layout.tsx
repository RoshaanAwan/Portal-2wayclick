import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

// Gate the entire /admin section: only the admin tier (SUPER_ADMIN, ADMIN) may
// enter. Individual pages further restrict (e.g. /admin/logs is Super Admin
// only). This is defense-in-depth on top of the sidebar visibility check.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can.accessAdmin(user.role)) redirect("/dashboard");

  return <>{children}</>;
}

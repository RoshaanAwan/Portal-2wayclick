import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

// Gate the entire /admin section. Admin tier (SUPER_ADMIN, ADMIN) gets the full
// section; Project Managers may enter only to reach the audit log. Individual
// pages enforce their own stricter checks (e.g. /admin/users stays admin-tier,
// /admin/logs uses viewAuditLog). Defense-in-depth on top of sidebar visibility.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // /admin is tenant-only now (tenant management moved to the /system area).
  // Admin tier gets the full section; Project Managers reach only the audit log.
  if (!can.accessAdmin(user.role) && !can.viewAuditLog(user.role)) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}

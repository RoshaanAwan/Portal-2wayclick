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
  // Platform admins reach /admin (for /admin/tenants) even if their tenant role
  // weren't admin-tier; otherwise require the tenant-level admin/audit access.
  if (
    !user.isPlatformAdmin &&
    !can.accessAdmin(user.role) &&
    !can.viewAuditLog(user.role)
  ) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}

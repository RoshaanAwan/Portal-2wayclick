import { Building2 } from "lucide-react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listTenants } from "@/lib/platform";
import { pageTitle } from "@/lib/brand";
import { PageHeader } from "@/components/ui/PageHeader";
import { TenantsClient } from "./TenantsClient";

export const metadata = { title: pageTitle("Tenants") };

// Platform-admin only: manage all tenants (create, suspend, impersonate).
export default async function AdminTenantsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isPlatformAdmin) redirect("/dashboard");

  const tenants = await listTenants();

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Tenants"
        subtitle="Create, suspend, and manage every workspace on the platform."
        icon={Building2}
      />
      <TenantsClient
        tenants={tenants.map((t) => ({
          ...t,
          suspendedAt: t.suspendedAt ? t.suspendedAt.toISOString() : null,
          createdAt: t.createdAt.toISOString(),
        }))}
        portalDomain={process.env.NEXT_PUBLIC_PORTAL_DOMAIN ?? "localhost:3000"}
      />
    </div>
  );
}

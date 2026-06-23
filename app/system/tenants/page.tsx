import { Building2 } from "lucide-react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listTenants } from "@/lib/platform";
import { pageTitle } from "@/lib/brand";
import { PageHeader } from "@/components/ui/PageHeader";
import { TenantsClient } from "./TenantsClient";

export const metadata = { title: "Tenants" };

// System Owner only: manage every workspace on the platform (create, suspend,
// reactivate, and impersonate a tenant's Company Owner).
export default async function SystemTenantsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isSystemOwner) redirect("/dashboard");

  const tenants = await listTenants();

  return (
    <div>
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

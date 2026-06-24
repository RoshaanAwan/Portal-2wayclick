import { Blocks } from "lucide-react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getIntegrationStates } from "@/lib/integrationsServer";
import { PageHeader } from "@/components/ui/PageHeader";
import { IntegrationsClient } from "./IntegrationsClient";

export const metadata = { title: "Integrations" };

export default async function AdminIntegrationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // The /admin layout already blocks non-admin-tier; this is defense-in-depth.
  if (!can.manageIntegrations(user.role)) redirect("/dashboard");

  // Catalog merged with this tenant's saved state (enabled flag + workspace URL).
  const integrations = await getIntegrationStates();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Integrations"
        subtitle="Turn on the third-party apps your team uses. Enabled apps appear on everyone's Tools launchpad."
        icon={Blocks}
      />
      <IntegrationsClient
        initial={integrations.map((i) => ({
          provider: i.provider,
          name: i.name,
          description: i.description,
          icon: i.icon,
          from: i.from,
          to: i.to,
          href: i.href,
          enabled: i.enabled,
          workspaceUrl: i.workspaceUrl ?? "",
          needsCredential: !!i.needsCredential,
          dashboard: i.dashboard ?? null,
          connected: i.connected,
          // Non-secret config only (never the token). GitHub: { org, repos }.
          config: i.config ?? {},
        }))}
      />
    </div>
  );
}

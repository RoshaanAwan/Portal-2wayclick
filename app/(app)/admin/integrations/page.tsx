import { Blocks } from "lucide-react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can, isSuperAdmin } from "@/lib/permissions";
import { getIntegrationStates, getSlackConnection } from "@/lib/integrationsServer";
import { tenantDriveStatus } from "@/lib/integrations/driveStorage";
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

  // The Google Drive card finishes its setup inline (connect the owner's account
  // + choose a destination folder), so it needs the live Drive connection status
  // — distinct from the catalog's `connected` (which only means "client secret
  // saved"). Owner-only actions (connect/folder) key off isOwner.
  const isOwner = isSuperAdmin(user.role);
  const drive = await tenantDriveStatus(user.tenantId);

  // The Slack card shows live OAuth connection status (whether the workspace's
  // bot token is stored) — distinct from the catalog `connected` (= the Slack app
  // client secret is saved). Null when not connected.
  const slack = await getSlackConnection();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Integrations"
        subtitle="Turn on the third-party apps your team uses. Enabled apps appear on everyone's Tools launchpad."
        icon={Blocks}
      />
      <IntegrationsClient
        isOwner={isOwner}
        driveStatus={{
          accountConnected: drive.connected,
          email: drive.email,
          folderSet: !!drive.folderId,
          folderName: drive.folderName,
          folderShared: drive.folderShared,
        }}
        slackStatus={{
          connected: !!slack,
          teamName: slack?.teamName ?? null,
        }}
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

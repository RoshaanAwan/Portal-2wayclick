import { LayoutGrid } from "lucide-react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { adminDb } from "@/lib/db";
import { getIntegrationStates } from "@/lib/integrationsServer";
import { PageHeader } from "@/components/ui/PageHeader";
import { IntegrationsClient } from "@/app/(app)/admin/integrations/IntegrationsClient";
import { SystemDriveCard } from "./SystemDriveCard";

export const metadata = { title: "Integrations" };

export default async function SystemIntegrationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isSystemOwner) redirect("/dashboard");

  const [driveConn, integrations] = await Promise.all([
    adminDb.googleDriveConnection.findUnique({
      where: { userId: user.id },
      select: { googleEmail: true },
    }),
    getIntegrationStates(),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Integrations"
        subtitle="Platform integration settings and Drive connection for the System Owner."
        icon={LayoutGrid}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
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
              config: i.config ?? {},
            }))}
            apiBase="/api/system/integrations"
            testApiBase="/api/system/integrations/test"
          />
        </div>

        <aside className="space-y-6">
          <SystemDriveCard
            initialEmail={driveConn?.googleEmail ?? null}
            redirectTo="/system/integrations"
          />
          <div className="rounded-3xl border border-line bg-surface-2 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-400">
              System owner guidance
            </h2>
            <p className="mt-3 text-sm leading-6 text-ink-600">
              This page lets the System Owner manage platform-level integrations and connect a Google Drive account for uploads.
            </p>
            <p className="mt-4 text-sm leading-6 text-ink-600">
              The Google Drive connection stores uploaded avatars and documents in your own Drive. If you need tenant-level integrations, impersonate a tenant from the Tenants page.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

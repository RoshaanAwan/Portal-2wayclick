import Link from "next/link";
import { redirect } from "next/navigation";
import { HardDrive, Settings } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { can, isSuperAdmin } from "@/lib/permissions";
import {
  isIntegrationEnabled,
  getGoogleOAuthCreds,
} from "@/lib/integrationsServer";
import {
  tenantDriveStatus,
  listTenantDriveFiles,
} from "@/lib/integrations/driveStorage";
import { type DriveFile } from "@/lib/integrations/googleDrive";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { GoogleDriveClient } from "./GoogleDriveClient";

export const metadata = { title: "Google Drive" };

export default async function GoogleDrivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const canManage = can.manageIntegrations(user.role);
  const isOwner = isSuperAdmin(user.role);
  const enabled = await isIntegrationEnabled("google-drive");
  const creds = await getGoogleOAuthCreds();
  const sp = await searchParams;

  // Admin hasn't enabled the tile for the tenant.
  if (!enabled) {
    return (
      <Shell>
        <Empty
          title="Google Drive isn’t enabled"
          body={
            canManage
              ? "Enable Google Drive in integration settings to let your team connect their accounts."
              : "An admin needs to enable Google Drive for your workspace first."
          }
          action={
            canManage ? (
              <Link href="/admin/integrations">
                <Button size="sm" variant="glass">
                  <Settings className="h-4 w-4" /> Open settings
                </Button>
              </Link>
            ) : null
          }
        />
      </Shell>
    );
  }

  // No Google OAuth app configured for this tenant (nor a platform fallback).
  if (!creds) {
    return (
      <Shell>
        <Empty
          title="Google sign-in isn’t set up yet"
          body={
            canManage
              ? "Add your Google OAuth Client ID and Secret on the integrations page before users can connect."
              : "An admin needs to add this workspace’s Google app credentials before you can connect."
          }
          action={
            canManage ? (
              <Link href="/admin/integrations">
                <Button size="sm" variant="glass">
                  <Settings className="h-4 w-4" /> Open settings
                </Button>
              </Link>
            ) : null
          }
        />
      </Shell>
    );
  }

  // The TENANT's Drive = the company owner's connection (shared workspace
  // storage). Any member sees its files; only the owner connects/disconnects.
  const status = await tenantDriveStatus(user.tenantId);
  let files: DriveFile[] = [];
  if (status.connected) {
    files = await listTenantDriveFiles(user.tenantId);
  }

  return (
    <Shell>
      <GoogleDriveClient
        connected={status.connected}
        isOwner={isOwner}
        email={status.email}
        files={files}
        loadError={null}
        oauthError={sp.error ?? null}
        justConnected={sp.connected === "1"}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Google Drive"
        subtitle="Your workspace’s shared Drive — files uploaded in the portal are stored here."
        icon={HardDrive}
      />
      {children}
    </div>
  );
}

function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <GlassCard hover={false} className="flex flex-col items-center gap-3 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-xl bg-surface-2">
        <HardDrive className="h-6 w-6 text-ink-300" />
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="max-w-sm text-xs text-ink-400">{body}</p>
      {action}
    </GlassCard>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { Mail, Settings, AlertCircle, KeyRound } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { can, isSuperAdmin } from "@/lib/permissions";
import { isIntegrationEnabled } from "@/lib/integrationsServer";
import {
  tenantGmailStatus,
  listTenantInbox,
  GmailError,
} from "@/lib/integrations/gmailServer";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { GmailWorkspace } from "./GmailWorkspace";

export const metadata = { title: "Gmail" };

export default async function GmailDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const canManage = can.manageIntegrations(user.role);
  const isOwner = isSuperAdmin(user.role);
  const enabled = await isIntegrationEnabled("gmail");
  const status = enabled
    ? await tenantGmailStatus(user.tenantId)
    : { connected: false, email: null, canSend: false, canRead: false, needsReconnect: false };

  // Only admins can use the workspace mailbox (it's the company address/inbox).
  if (!canManage) {
    return (
      <Shell>
        <Empty
          text="The workspace mailbox is admin-only."
          hint="Ask an admin to send mail or review the inbox here."
        />
      </Shell>
    );
  }

  // Not enabled, or no Google account connected at all.
  if (!enabled || !status.connected) {
    return (
      <Shell>
        <Empty
          text={!enabled ? "Gmail isn’t enabled yet" : "No Google account is connected"}
          hint={
            !enabled
              ? "Enable Gmail in Integrations, then connect the workspace Google account."
              : "Connect the workspace Google account in Integrations to send and read email here."
          }
          action={
            <Link href="/admin/integrations">
              <Button size="sm" variant="glass" className="mt-1">
                <Settings className="h-4 w-4" /> Open Integrations
              </Button>
            </Link>
          }
        />
      </Shell>
    );
  }

  // Connected, but the connection predates the Gmail scopes → reconnect needed.
  if (status.needsReconnect) {
    return (
      <Shell email={status.email}>
        <Empty
          text="Reconnect to enable Gmail"
          hint={
            isOwner
              ? "Your connected Google account hasn’t granted email access yet. Reconnect to add the Gmail permissions."
              : "The company owner needs to reconnect the workspace Google account to grant Gmail access."
          }
          action={
            isOwner ? (
              <a href="/api/integrations/google/connect">
                <Button size="sm" className="mt-1">
                  <KeyRound className="h-4 w-4" /> Reconnect Google
                </Button>
              </a>
            ) : undefined
          }
        />
      </Shell>
    );
  }

  // Fully connected: load the inbox (read scope present). A hard failure renders
  // inline so the page never 500s on a provider hiccup.
  let inbox: Awaited<ReturnType<typeof listTenantInbox>> = [];
  let error: string | null = null;
  if (status.canRead) {
    try {
      inbox = await listTenantInbox(user.tenantId);
    } catch (e) {
      error = e instanceof GmailError ? e.message : "Couldn’t load the inbox.";
    }
  }

  return (
    <Shell email={status.email}>
      {error ? (
        <GlassCard hover={false} className="flex items-start gap-3 border-danger/30">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <p className="text-sm font-medium text-ink">{error}</p>
        </GlassCard>
      ) : (
        <GmailWorkspace
          inbox={inbox}
          canRead={status.canRead}
          canSend={status.canSend}
          fromEmail={status.email}
        />
      )}
    </Shell>
  );
}

function Shell({ children, email }: { children: React.ReactNode; email?: string | null }) {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Gmail"
        subtitle={email ? `Workspace mailbox: ${email}` : "Send & read your workspace email."}
        icon={Mail}
      />
      {children}
    </div>
  );
}

function Empty({
  text,
  hint,
  action,
}: {
  text: string;
  hint: string;
  action?: React.ReactNode;
}) {
  return (
    <GlassCard hover={false} className="flex flex-col items-center gap-3 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-xl bg-surface-2">
        <Mail className="h-6 w-6 text-ink-300" />
      </div>
      <p className="text-sm font-medium text-ink">{text}</p>
      <p className="max-w-sm text-xs text-ink-400">{hint}</p>
      {action}
    </GlassCard>
  );
}

export const dynamic = "force-dynamic";

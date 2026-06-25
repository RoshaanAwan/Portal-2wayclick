import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquare, Settings, AlertCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import {
  getSlackConnection,
  isIntegrationEnabled,
} from "@/lib/integrationsServer";
import { listChannels, SlackError } from "@/lib/integrations/slack";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { SlackWorkspace } from "./SlackWorkspace";

export const metadata = { title: "Slack" };

export default async function SlackDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const canManage = can.manageIntegrations(user.role);
  const enabled = await isIntegrationEnabled("slack");
  const conn = enabled ? await getSlackConnection() : null;

  // Not connected (or admin disabled the tile): friendly empty state. Admins get
  // the "Add to Slack" action; everyone else is told to ask an admin.
  if (!conn) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="Slack"
          subtitle="Your workspace's channels, in the portal."
          icon={MessageSquare}
        />
        <GlassCard hover={false} className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-surface-2">
            <MessageSquare className="h-6 w-6 text-ink-300" />
          </div>
          <p className="text-sm font-medium text-ink">Slack isn’t connected yet</p>
          <p className="max-w-sm text-xs text-ink-400">
            {!enabled
              ? canManage
                ? "Enable the Slack integration in settings, then connect your workspace."
                : "An admin needs to enable Slack before it shows up here."
              : canManage
                ? "Connect your Slack workspace to view channels, post messages, and route portal notifications here."
                : "An admin needs to connect Slack before channels show up here."}
          </p>
          {canManage &&
            (enabled ? (
              <a href="/api/integrations/slack/connect">
                <Button size="sm" variant="glass" className="mt-1">
                  <MessageSquare className="h-4 w-4" /> Add to Slack
                </Button>
              </a>
            ) : (
              <Link href="/admin/integrations">
                <Button size="sm" variant="glass" className="mt-1">
                  <Settings className="h-4 w-4" /> Enable Slack
                </Button>
              </Link>
            ))}
        </GlassCard>
      </div>
    );
  }

  // Connected: load the channel list server-side. A hard failure (revoked token,
  // Slack down) renders inline so the page never 500s on a provider error.
  let channels: Awaited<ReturnType<typeof listChannels>> = [];
  let error: string | null = null;
  try {
    channels = await listChannels(conn.botToken);
  } catch (e) {
    error =
      e instanceof SlackError
        ? e.message
        : "Couldn’t load channels from Slack.";
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Slack"
        subtitle={
          conn.teamName
            ? `Connected to ${conn.teamName}.`
            : "Your workspace's channels, in the portal."
        }
        icon={MessageSquare}
      />

      {error ? (
        <GlassCard hover={false} className="flex items-start gap-3 border-danger/30">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div>
            <p className="text-sm font-medium text-ink">{error}</p>
            {canManage && (
              <Link
                href="/admin/integrations"
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                <Settings className="h-3.5 w-3.5" /> Review Slack settings
              </Link>
            )}
          </div>
        </GlassCard>
      ) : (
        <SlackWorkspace
          channels={channels}
          notifyChannelId={conn.notifyChannelId}
          notifyChannelName={conn.notifyChannelName}
          canManage={canManage}
        />
      )}
    </div>
  );
}

export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { GitPullRequest, Settings, AlertCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getIntegrationSecret } from "@/lib/integrationsServer";
import { listOpenPRs, GitHubError, type GitHubConfig } from "@/lib/integrations/github";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { PullRequestList } from "./PullRequestList";

export const metadata = { title: "GitHub" };

export default async function GitHubDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const canManage = can.manageIntegrations(user.role);
  const creds = await getIntegrationSecret("github");

  // Not connected (or admin disabled it): show a friendly empty state.
  if (!creds) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title="GitHub"
          subtitle="Open pull requests across your team's repositories."
          icon={GitPullRequest}
        />
        <GlassCard hover={false} className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-surface-2">
            <GitPullRequest className="h-6 w-6 text-ink-300" />
          </div>
          <p className="text-sm font-medium text-ink">GitHub isn’t connected yet</p>
          <p className="max-w-sm text-xs text-ink-400">
            {canManage
              ? "Add a GitHub access token and choose which repos to track to see live pull requests here."
              : "An admin needs to connect GitHub before pull requests show up here."}
          </p>
          {canManage && (
            <Link href="/admin/integrations">
              <Button size="sm" variant="glass" className="mt-1">
                <Settings className="h-4 w-4" /> Connect GitHub
              </Button>
            </Link>
          )}
        </GlassCard>
      </div>
    );
  }

  const config = creds.config as GitHubConfig;

  // Fetch live PRs. A hard failure (bad token, GitHub down) is shown inline so
  // the page never 500s on a transient provider error.
  let prs: Awaited<ReturnType<typeof listOpenPRs>> | null = null;
  let error: string | null = null;
  try {
    prs = await listOpenPRs(creds.token, config);
  } catch (e) {
    error =
      e instanceof GitHubError
        ? e.message
        : "Couldn’t load pull requests from GitHub.";
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="GitHub"
        subtitle="Open pull requests across your team's repositories."
        icon={GitPullRequest}
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
                <Settings className="h-3.5 w-3.5" /> Review GitHub settings
              </Link>
            )}
          </div>
        </GlassCard>
      ) : (
        <PullRequestList
          prs={prs!.prs}
          repos={prs!.repos}
          skipped={prs!.skipped}
          canManage={canManage}
        />
      )}
    </div>
  );
}

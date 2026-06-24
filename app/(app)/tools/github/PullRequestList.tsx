"use client";

import { useMemo, useState } from "react";
import {
  GitPullRequest,
  GitPullRequestDraft,
  MessageSquare,
  ExternalLink,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { cn, timeAgo } from "@/lib/utils";
import type { PullRequest } from "@/lib/integrations/github";

export function PullRequestList({
  prs,
  repos,
  skipped,
  canManage,
}: {
  prs: PullRequest[];
  repos: string[];
  skipped: string[];
  canManage: boolean;
}) {
  const [repo, setRepo] = useState<string>("all");
  const [hideDrafts, setHideDrafts] = useState(false);

  const filtered = useMemo(
    () =>
      prs.filter(
        (p) =>
          (repo === "all" || p.repo === repo) && (!hideDrafts || !p.draft),
      ),
    [prs, repo, hideDrafts],
  );

  return (
    <div className="space-y-4">
      {/* Summary + filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-400">
          <span className="font-semibold text-ink">{filtered.length}</span> open
          pull request{filtered.length === 1 ? "" : "s"}
          {repos.length > 0 && (
            <>
              {" "}
              across {repos.length} repo{repos.length === 1 ? "" : "s"}
            </>
          )}
        </p>

        <div className="flex items-center gap-2">
          <select
            className="input h-9 w-auto py-0 text-sm"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
          >
            <option value="all">All repos</option>
            {repos.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setHideDrafts((v) => !v)}
            className={cn(
              "h-9 rounded-xl border px-3 text-sm font-medium transition-colors",
              hideDrafts
                ? "border-accent bg-accent-soft text-accent-ink"
                : "border-line bg-surface-2 text-ink-500 hover:text-ink",
            )}
          >
            Hide drafts
          </button>
        </div>
      </div>

      {skipped.length > 0 && (
        <p className="text-xs text-warn-ink">
          Couldn’t read {skipped.length} repo{skipped.length === 1 ? "" : "s"} (
          {skipped.join(", ")}). Check the name and token access
          {canManage ? " in integration settings." : "."}
        </p>
      )}

      {filtered.length === 0 ? (
        <GlassCard hover={false} className="flex flex-col items-center gap-2 py-10 text-center">
          <GitPullRequest className="h-6 w-6 text-ink-300" />
          <p className="text-sm font-medium text-ink">No open pull requests</p>
          <p className="text-xs text-ink-400">
            {prs.length === 0
              ? "Nothing to review right now."
              : "Nothing matches the current filters."}
          </p>
        </GlassCard>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((pr) => (
            <a
              key={pr.id}
              href={pr.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group block"
            >
              <GlassCard hover className="flex items-center gap-3.5 p-3.5">
                {pr.draft ? (
                  <GitPullRequestDraft className="h-5 w-5 shrink-0 text-ink-400" />
                ) : (
                  <GitPullRequest className="h-5 w-5 shrink-0 text-success" />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-ink">
                      {pr.title}
                    </p>
                    {pr.draft && (
                      <Badge variant="neutral" className="shrink-0">
                        Draft
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-400">
                    <span className="font-mono">
                      {pr.repo}#{pr.number}
                    </span>
                    <span>·</span>
                    <span>
                      by {pr.author} · updated {timeAgo(pr.updatedAt)}
                    </span>
                    {pr.comments > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" /> {pr.comments}
                      </span>
                    )}
                    {pr.labels.slice(0, 3).map((l) => (
                      <span
                        key={l.name}
                        className="inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-medium"
                        style={{
                          backgroundColor: `#${l.color}22`,
                          color: `#${l.color}`,
                        }}
                      >
                        {l.name}
                      </span>
                    ))}
                  </p>
                </div>

                {/* Reviewer avatars */}
                {pr.reviewers.length > 0 && (
                  <div className="hidden shrink-0 -space-x-2 sm:flex">
                    {pr.reviewers.slice(0, 3).map((r) => (
                      <Avatar key={r} name={r} size="xs" ring />
                    ))}
                  </div>
                )}

                <ExternalLink className="h-4 w-4 shrink-0 text-ink-300 transition-colors group-hover:text-accent" />
              </GlassCard>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

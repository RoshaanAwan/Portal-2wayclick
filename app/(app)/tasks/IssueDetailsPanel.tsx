"use client";

import { useState } from "react";
import { Link2, Plus, Tag, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import {
  ISSUE_LINK_TYPES,
  ISSUE_TYPES,
  STORY_POINT_OPTIONS,
  WORKFLOW_STATUSES,
  issueLinkPhrasing,
  issueTypeLabel,
  statusLabel,
  type IssueLinkType,
  type WorkflowStatus,
} from "@/lib/constants";
import { IssueTypeIcon, StatusPill } from "./issueUi";
import type { MemberDTO, SprintDTO, TaskDTO } from "./BoardClient";

// The JIRA "details" sidebar inside the issue modal: workflow status, type,
// story points, reporter, sprint, labels and links. Each field writes through
// the optimistic handlers the board owns, so the modal stays a thin shell.
export function IssueDetailsPanel({
  task,
  members,
  sprints,
  canManage,
  canTransition,
  onChangeStatus,
  onPatchIssue,
  onAddLink,
  onRemoveLink,
  onOpenTask,
}: {
  task: TaskDTO;
  members: MemberDTO[];
  sprints: SprintDTO[];
  canManage: boolean;
  // Status may be advanced by assignees too (they work the issue).
  canTransition: boolean;
  onChangeStatus: (taskId: string, status: WorkflowStatus) => Promise<boolean>;
  onPatchIssue: (
    taskId: string,
    payload: {
      issueType?: string;
      storyPoints?: number | null;
      reporterId?: string | null;
      sprintId?: string | null;
      labels?: string[];
    },
  ) => Promise<boolean>;
  onAddLink: (
    taskId: string,
    targetKey: string,
    type: string,
  ) => Promise<string | null>;
  onRemoveLink: (taskId: string, linkId: string) => Promise<boolean>;
  onOpenTask?: (taskId: string) => void;
}) {
  const [labelDraft, setLabelDraft] = useState("");
  const [linkType, setLinkType] = useState<IssueLinkType>("BLOCKS");
  const [linkKey, setLinkKey] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  const reporter = task.reporter;
  // Only sprints you can still plan into (not completed).
  const planningSprints = sprints.filter((s) => s.status !== "COMPLETED");

  async function addLabel() {
    const v = labelDraft.trim();
    if (!v || task.labels.includes(v)) {
      setLabelDraft("");
      return;
    }
    setLabelDraft("");
    await onPatchIssue(task.id, { labels: [...task.labels, v] });
  }

  async function removeLabel(label: string) {
    await onPatchIssue(task.id, {
      labels: task.labels.filter((l) => l !== label),
    });
  }

  async function submitLink(e: React.FormEvent) {
    e.preventDefault();
    const key = linkKey.trim();
    if (!key || linking) return;
    setLinking(true);
    setLinkError(null);
    const err = await onAddLink(task.id, key, linkType);
    setLinking(false);
    if (err) setLinkError(err);
    else setLinkKey("");
  }

  return (
    <div className="space-y-5 rounded-xl border border-line bg-surface-2/50 p-4">
      {/* Status — the workflow transition */}
      <Field label="Status">
        <select
          value={task.status}
          disabled={!canTransition}
          onChange={(e) =>
            onChangeStatus(task.id, e.target.value as WorkflowStatus)
          }
          className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-xs font-medium text-ink focus:border-accent/40 focus:outline-none disabled:opacity-60"
        >
          {WORKFLOW_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel[s]}
            </option>
          ))}
        </select>
      </Field>

      {/* Type */}
      <Field label="Type">
        {canManage ? (
          <select
            value={task.issueType}
            onChange={(e) =>
              onPatchIssue(task.id, { issueType: e.target.value })
            }
            className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-xs font-medium text-ink focus:border-accent/40 focus:outline-none"
          >
            {ISSUE_TYPES.map((t) => (
              <option key={t} value={t}>
                {issueTypeLabel[t]}
              </option>
            ))}
          </select>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink">
            <IssueTypeIcon type={task.issueType} />
            {issueTypeLabel[task.issueType as keyof typeof issueTypeLabel] ??
              task.issueType}
          </span>
        )}
      </Field>

      {/* Story points */}
      <Field label="Story points">
        <div className="flex flex-wrap items-center gap-1">
          {STORY_POINT_OPTIONS.map((p) => (
            <button
              key={p}
              type="button"
              disabled={!canManage}
              onClick={() =>
                onPatchIssue(task.id, {
                  storyPoints: task.storyPoints === p ? null : p,
                })
              }
              className={cn(
                "grid h-6 w-6 place-items-center rounded-full border text-[11px] font-semibold transition-colors disabled:opacity-60",
                task.storyPoints === p
                  ? "border-accent/30 bg-accent-soft text-accent-ink"
                  : "border-line bg-surface text-ink-500 hover:text-ink",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </Field>

      {/* Reporter */}
      <Field label="Reporter">
        {canManage ? (
          <select
            value={reporter?.id ?? ""}
            onChange={(e) =>
              onPatchIssue(task.id, { reporterId: e.target.value || null })
            }
            className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-xs font-medium text-ink focus:border-accent/40 focus:outline-none"
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        ) : reporter ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink">
            <Avatar name={reporter.name} src={reporter.avatarUrl} size="xs" />
            {reporter.name}
          </span>
        ) : (
          <span className="text-xs text-ink-400">Unassigned</span>
        )}
      </Field>

      {/* Sprint */}
      {planningSprints.length > 0 && (
        <Field label="Sprint">
          <select
            value={task.sprintId ?? ""}
            disabled={!canManage}
            onChange={(e) =>
              onPatchIssue(task.id, { sprintId: e.target.value || null })
            }
            className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-xs font-medium text-ink focus:border-accent/40 focus:outline-none disabled:opacity-60"
          >
            <option value="">Backlog</option>
            {planningSprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.status === "ACTIVE" ? " (active)" : ""}
              </option>
            ))}
          </select>
        </Field>
      )}

      {/* Labels */}
      <Field label="Labels">
        <div className="flex flex-wrap items-center gap-1.5">
          {task.labels.map((l) => (
            <span
              key={l}
              className="inline-flex items-center gap-1 rounded-md bg-surface px-1.5 py-0.5 text-[11px] font-medium text-ink-600"
            >
              <Tag className="h-2.5 w-2.5 text-ink-400" />
              {l}
              {canManage && (
                <button
                  type="button"
                  aria-label={`Remove ${l}`}
                  onClick={() => removeLabel(l)}
                  className="text-ink-400 hover:text-danger-ink"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </span>
          ))}
          {canManage && (
            <input
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addLabel();
                }
              }}
              onBlur={() => void addLabel()}
              placeholder="add…"
              maxLength={40}
              className="h-6 w-20 rounded-md border border-line bg-surface px-1.5 text-[11px] text-ink placeholder:text-ink-400 focus:border-accent/40 focus:outline-none"
            />
          )}
          {!task.labels.length && !canManage && (
            <span className="text-xs text-ink-400">None</span>
          )}
        </div>
      </Field>

      {/* Linked issues */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-ink-500">
          <Link2 className="h-3.5 w-3.5" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wide">
            Linked issues
          </h4>
        </div>
        <div className="space-y-1.5">
          {task.links.length === 0 && (
            <p className="text-xs text-ink-400">No linked issues.</p>
          )}
          {task.links.map((l) => {
            const phrasing =
              issueLinkPhrasing[l.type as IssueLinkType]?.[l.direction] ??
              l.type;
            return (
              <div
                key={l.id}
                className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs"
              >
                <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-ink-400">
                  {phrasing}
                </span>
                <IssueTypeIcon type={l.issueType} />
                <button
                  type="button"
                  onClick={() => onOpenTask?.(l.taskId)}
                  className="font-mono text-[11px] font-semibold text-accent-ink hover:underline"
                >
                  {l.issueKey}
                </button>
                <span className="min-w-0 flex-1 truncate text-ink-600">
                  {l.title}
                </span>
                <StatusPill status={l.status} />
                {canManage && (
                  <button
                    type="button"
                    aria-label="Remove link"
                    onClick={() => onRemoveLink(task.id, l.id)}
                    className="text-ink-400 hover:text-danger-ink"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {canManage && (
          <form onSubmit={submitLink} className="mt-2 flex items-center gap-1.5">
            <select
              value={linkType}
              onChange={(e) => setLinkType(e.target.value as IssueLinkType)}
              className="h-8 rounded-lg border border-line bg-surface px-1.5 text-[11px] text-ink-600 focus:border-accent/40 focus:outline-none"
            >
              {ISSUE_LINK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {issueLinkPhrasing[t].outward}
                </option>
              ))}
            </select>
            <input
              value={linkKey}
              onChange={(e) => {
                setLinkKey(e.target.value);
                setLinkError(null);
              }}
              placeholder="ISSUE-123"
              className="h-8 w-24 rounded-lg border border-line bg-surface px-2 font-mono text-[11px] text-ink placeholder:text-ink-400 focus:border-accent/40 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!linkKey.trim() || linking}
              className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface text-ink-500 hover:text-ink disabled:opacity-50"
              aria-label="Add link"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </form>
        )}
        {linkError && (
          <p className="mt-1 text-[11px] text-danger-ink">{linkError}</p>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
        {label}
      </p>
      {children}
    </div>
  );
}

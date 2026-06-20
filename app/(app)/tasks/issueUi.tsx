"use client";

import {
  Bug,
  BookmarkCheck,
  CheckSquare,
  Layers,
  GitBranch,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  issueTypeLabel,
  statusLabel,
  statusBadge,
  type IssueType,
  type WorkflowStatus,
} from "@/lib/constants";

// ── Client-side issue presentation ────────────────────────────────────────────
// Pure display helpers for the JIRA fields, shared by the card, modal, backlog
// and the deep-link page. The server-only key/workflow logic lives in
// lib/issues.ts; this file is the rendering counterpart (icons + colors).

const TYPE_ICON: Record<IssueType, LucideIcon> = {
  STORY: BookmarkCheck,
  BUG: Bug,
  TASK: CheckSquare,
  EPIC: Layers,
  SUBTASK: GitBranch,
};

// Type → icon tint. JIRA's convention: stories green, bugs red, tasks blue,
// epics purple, subtasks teal.
const TYPE_TINT: Record<IssueType, string> = {
  STORY: "text-success-ink",
  BUG: "text-danger-ink",
  TASK: "text-info-ink",
  EPIC: "text-accent-ink",
  SUBTASK: "text-info-ink",
};

function asType(v: string): IssueType {
  return (Object.keys(issueTypeLabel) as IssueType[]).includes(v as IssueType)
    ? (v as IssueType)
    : "TASK";
}

function asStatus(v: string): WorkflowStatus {
  return (Object.keys(statusLabel) as WorkflowStatus[]).includes(
    v as WorkflowStatus,
  )
    ? (v as WorkflowStatus)
    : "TODO";
}

/** Small square icon for an issue type, tinted by convention. */
export function IssueTypeIcon({
  type,
  className,
}: {
  type: string;
  className?: string;
}) {
  const t = asType(type);
  const Icon = TYPE_ICON[t];
  return (
    <Icon
      className={cn("h-3.5 w-3.5 shrink-0", TYPE_TINT[t], className)}
      aria-label={issueTypeLabel[t]}
    />
  );
}

/** The monospace issue key, e.g. PORTAL-42. */
export function IssueKey({
  keyText,
  className,
}: {
  keyText: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono text-[11px] font-semibold tracking-tight text-ink-400",
        className,
      )}
    >
      {keyText}
    </span>
  );
}

const STATUS_PILL: Record<WorkflowStatus, string> = {
  TODO: "bg-surface-2 text-ink-500 border-line",
  IN_PROGRESS: "bg-info-soft text-info-ink border-info/20",
  IN_REVIEW: "bg-warn-soft text-warn-ink border-warn/20",
  DONE: "bg-success-soft text-success-ink border-success/20",
};

/** Status chip, colored by lifecycle stage. */
export function StatusPill({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const s = asStatus(status);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        STATUS_PILL[s],
        className,
      )}
    >
      {statusLabel[s]}
    </span>
  );
}

/** Story-points chip (small, rounded). Null/0 renders nothing. */
export function PointsBadge({
  points,
  className,
}: {
  points: number | null | undefined;
  className?: string;
}) {
  if (points == null) return null;
  return (
    <span
      title={`${points} story points`}
      className={cn(
        "inline-grid h-5 min-w-5 place-items-center rounded-full bg-accent-soft px-1.5 text-[10px] font-bold text-accent-ink",
        className,
      )}
    >
      {points}
    </span>
  );
}

export { statusBadge };

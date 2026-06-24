import Link from "@/components/Link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, Clock, Target } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMinutes, timeAgo } from "@/lib/utils";
import {
  issueLinkPhrasing,
  issueTypeLabel,
  priorityLabel,
  priorityVariant,
  statusLabel,
  type IssueLinkType,
  type IssueType,
  type TaskPriority,
  type WorkflowStatus,
} from "@/lib/constants";
import { issueKey, parseIssueKey } from "@/lib/issues";
import { IssueTypeIcon, IssueKey, StatusPill, PointsBadge } from "../issueUi";

// Deep-link page for a single issue, e.g. /tasks/PORTAL-42. Resolves the key to
// the matching card on its board and renders a focused, shareable detail view.
// Editing still happens on the board (the modal), so this page links back.
export default async function IssuePage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  await getCurrentUser();
  const { key } = await params;
  const decoded = decodeURIComponent(key);
  const parsed = parseIssueKey(decoded);

  // Resolve either a human issue key (2WAYCL-19) or a raw card id. The id form
  // is what the dashboard links by, so cards that haven't been assigned an
  // issueNumber yet (key renders as "—") still deep-link correctly.
  const where = parsed
    ? {
        issueNumber: parsed.number,
        list: { board: { keyPrefix: parsed.prefix } },
      }
    : { id: decoded };

  const task = await db.task.findFirst({
    where,
    include: {
      list: { select: { name: true, board: { select: { keyPrefix: true, name: true } } } },
      creator: { select: { id: true, name: true, avatarUrl: true } },
      reporter: { select: { id: true, name: true, avatarUrl: true } },
      assignees: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
      sprint: { select: { name: true, status: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true, avatarUrl: true } } },
      },
      outgoingLinks: {
        include: { target: { select: { title: true, status: true, issueType: true, issueNumber: true } } },
      },
      incomingLinks: {
        include: { source: { select: { title: true, status: true, issueType: true, issueNumber: true } } },
      },
    },
  });
  if (!task) notFound();

  const prefix = task.list.board.keyPrefix;
  const priority = task.priority as TaskPriority;
  const links = [
    ...task.outgoingLinks.map((l) => ({
      id: l.id,
      type: l.type as IssueLinkType,
      direction: "outward" as const,
      key: issueKey(prefix, l.target.issueNumber),
      title: l.target.title,
      status: l.target.status,
      issueType: l.target.issueType,
    })),
    ...task.incomingLinks.map((l) => ({
      id: l.id,
      type: l.type as IssueLinkType,
      direction: "inward" as const,
      key: issueKey(prefix, l.source.issueNumber),
      title: l.source.title,
      status: l.source.status,
      issueType: l.source.issueType,
    })),
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/tasks"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-400 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to board
      </Link>

      <div className="rounded-2xl border border-line bg-surface p-6">
        <div className="mb-3 flex items-center gap-2">
          <IssueTypeIcon type={task.issueType} className="h-4 w-4" />
          <IssueKey keyText={issueKey(prefix, task.issueNumber)} className="text-xs" />
          <span className="text-ink-300">·</span>
          <span className="eyebrow !mb-0">{task.list.board.name}</span>
        </div>

        <h1 className="text-2xl font-semibold leading-tight text-ink">
          {task.title}
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusPill status={task.status} />
          <Badge variant={priorityVariant[priority]}>
            {priorityLabel[priority]} priority
          </Badge>
          <Badge variant="neutral">
            {issueTypeLabel[task.issueType as IssueType] ?? task.issueType}
          </Badge>
          {task.storyPoints != null && (
            <span className="inline-flex items-center gap-1 text-xs text-ink-500">
              <PointsBadge points={task.storyPoints} /> points
            </span>
          )}
          {task.dueDate && (
            <Badge variant="neutral">
              <CalendarClock className="h-3 w-3" />
              Due {formatDate(task.dueDate)}
            </Badge>
          )}
          {task.estimateMinutes != null && (
            <Badge variant="neutral">
              <Target className="h-3 w-3" />
              {formatMinutes(task.estimateMinutes)} est
            </Badge>
          )}
          {task.timeSpentMinutes > 0 && (
            <Badge variant="neutral">
              <Clock className="h-3 w-3" />
              {formatMinutes(task.timeSpentMinutes)} tracked
            </Badge>
          )}
          {task.sprint && (
            <Badge variant="accent">
              {task.sprint.name}
              {task.sprint.status === "ACTIVE" ? " · active" : ""}
            </Badge>
          )}
        </div>

        {task.labels.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {task.labels.map((l) => (
              <span
                key={l}
                className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-600"
              >
                {l}
              </span>
            ))}
          </div>
        )}

        {/* People */}
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm sm:grid-cols-3">
          <Person label="Reporter" person={task.reporter} />
          <Person label="Creator" person={task.creator} />
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
              Assignees
            </p>
            {task.assignees.length === 0 ? (
              <span className="text-xs text-ink-400">Unassigned</span>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                {task.assignees.map((a) => (
                  <span
                    key={a.user.id}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-ink"
                  >
                    <Avatar name={a.user.name} src={a.user.avatarUrl} size="xs" />
                    {a.user.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="mt-5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
            Description
          </p>
          {task.description?.trim() ? (
            <p className="whitespace-pre-wrap break-words rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-sm leading-relaxed text-ink-700">
              {task.description}
            </p>
          ) : (
            <p className="rounded-xl border border-dashed border-line px-3.5 py-3 text-sm text-ink-400">
              No description.
            </p>
          )}
        </div>

        {/* Links */}
        {links.length > 0 && (
          <div className="mt-5">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
              Linked issues
            </p>
            <div className="space-y-1.5">
              {links.map((l) => (
                <Link
                  key={l.id}
                  href={`/tasks/${l.key}`}
                  className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs hover:border-line-strong"
                >
                  <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-ink-400">
                    {issueLinkPhrasing[l.type]?.[l.direction] ?? l.type}
                  </span>
                  <IssueTypeIcon type={l.issueType} />
                  <span className="font-mono text-[11px] font-semibold text-accent-ink">
                    {l.key}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink-600">
                    {l.title}
                  </span>
                  <StatusPill status={l.status} />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Comments */}
        <div className="mt-6 border-t border-line pt-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
            Comments ({task.comments.length})
          </p>
          {task.comments.length === 0 ? (
            <p className="text-xs text-ink-400">No comments yet.</p>
          ) : (
            <div className="space-y-3">
              {task.comments.map((c) => (
                <div key={c.id} className="flex gap-2.5">
                  <Avatar name={c.author.name} src={c.author.avatarUrl} size="xs" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-semibold text-ink">
                        {c.author.name}
                      </span>
                      <span className="text-[10px] text-ink-400">
                        {timeAgo(c.createdAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-700">
                      {c.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Person({
  label,
  person,
}: {
  label: string;
  person: { name: string; avatarUrl: string | null } | null;
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
        {label}
      </p>
      {person ? (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink">
          <Avatar name={person.name} src={person.avatarUrl} size="xs" />
          {person.name}
        </span>
      ) : (
        <span className="text-xs text-ink-400">—</span>
      )}
    </div>
  );
}

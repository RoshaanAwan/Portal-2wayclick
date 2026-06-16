"use client";

import { useEffect, useState } from "react";
import {
  Search,
  ChevronDown,
  UserPlus,
  UserCog,
  Image as ImageIcon,
  LogIn,
  LogOut,
  ShieldAlert,
  FolderPlus,
  ListPlus,
  UserMinus,
  CalendarCheck,
  CalendarPlus,
  Megaphone,
  MessageSquare,
  Smile,
  FileText,
  Upload,
  SquareCheck,
  UserCheck,
  Move,
  Activity as ActivityIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { GlassCard } from "@/components/ui/GlassCard";
import { Pagination } from "@/components/ui/Pagination";
import { ROLE_LABELS, ROLE_BADGE, type Role } from "@/lib/permissions";
import { useListParams } from "@/lib/useListParams";
import { timeAgo, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

export interface AuditRow {
  id: string;
  actorName: string;
  actorRole: string;
  actorAvatar: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string | null;
  detail: string | null; // JSON string
  ip: string | null;
  targetName: string | null;
  createdAt: string;
}

// Icon + tone per action family.
const ACTION_META: Record<
  string,
  { icon: typeof UserPlus; tone: "accent" | "emerald" | "amber" | "red" | "cyan" | "neutral"; label: string }
> = {
  // Users & auth
  "user.create": { icon: UserPlus, tone: "emerald", label: "User created" },
  "user.role_change": { icon: ShieldAlert, tone: "amber", label: "Role changed" },
  "user.delete": { icon: ShieldAlert, tone: "red", label: "User deleted" },
  "user.profile_update": { icon: UserCog, tone: "neutral", label: "Profile updated" },
  "user.avatar_update": { icon: ImageIcon, tone: "neutral", label: "Photo updated" },
  "auth.login": { icon: LogIn, tone: "cyan", label: "Signed in" },
  "auth.logout": { icon: LogOut, tone: "neutral", label: "Signed out" },
  // Projects
  "project.create": { icon: FolderPlus, tone: "accent", label: "Project created" },
  "project.list_create": { icon: ListPlus, tone: "accent", label: "List created" },
  "project.member_add": { icon: UserPlus, tone: "emerald", label: "Member added" },
  "project.member_remove": { icon: UserMinus, tone: "red", label: "Member removed" },
  // Leave
  "leave.create": { icon: CalendarPlus, tone: "cyan", label: "Leave requested" },
  "leave.decide": { icon: CalendarCheck, tone: "amber", label: "Leave decided" },
  // Announcements
  "announcement.create": { icon: Megaphone, tone: "accent", label: "Announcement" },
  "announcement.comment": { icon: MessageSquare, tone: "neutral", label: "Comment" },
  "announcement.react": { icon: Smile, tone: "neutral", label: "Reaction" },
  // Documents
  "document.create": { icon: FileText, tone: "emerald", label: "Document added" },
  "document.upload": { icon: Upload, tone: "emerald", label: "File uploaded" },
  // Tasks
  "task.create": { icon: SquareCheck, tone: "accent", label: "Task created" },
  "task.assign": { icon: UserCheck, tone: "emerald", label: "Task assigned" },
  "task.unassign": { icon: UserMinus, tone: "amber", label: "Task unassigned" },
  "task.comment": { icon: MessageSquare, tone: "neutral", label: "Task comment" },
  "task.move": { icon: Move, tone: "neutral", label: "Task moved" },
};

// Stable, alphabetized action list for the filter dropdown. With filtering now
// done on the backend, the options can no longer be derived from the loaded
// rows (a page may not contain every action), so we list the known actions.
const ACTION_OPTIONS = Object.keys(ACTION_META).sort();

function actionMeta(action: string) {
  return (
    ACTION_META[action] ?? {
      icon: ActivityIcon,
      tone: "neutral" as const,
      label: action,
    }
  );
}

export function LogsClient({
  logs,
  page,
  pageCount,
  query,
  action,
}: {
  logs: AuditRow[];
  page: number;
  pageCount: number;
  query: string;
  action: string;
}) {
  const { setParams, isPending } = useListParams({ q: query, action, page });

  // Local mirror of the search box; pushed to the URL (debounced) so filtering
  // happens on the server across the whole dataset, not just the current page.
  const [search, setSearch] = useState(query);
  useEffect(() => setSearch(query), [query]);

  // Debounce search-box edits before hitting the server.
  useEffect(() => {
    if (search === query) return;
    const t = setTimeout(() => setParams({ q: search, page: 1 }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actor, summary, IP…"
            className="input pl-9"
          />
        </div>
        <select
          value={action}
          onChange={(e) => setParams({ action: e.target.value, page: 1 })}
          className="input max-w-[200px]"
        >
          <option value="ALL">All actions</option>
          {ACTION_OPTIONS.map((a) => (
            <option key={a} value={a}>
              {actionMeta(a).label}
            </option>
          ))}
        </select>
      </div>

      <GlassCard hover={false} className="p-0">
        {logs.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-ink-400">
            No audit entries match your filter.
          </p>
        ) : (
          <ul
            className={cn(
              "divide-y divide-line/60 transition-opacity",
              isPending && "pointer-events-none opacity-60",
            )}
          >
            {logs.map((l) => (
              <LogItem key={l.id} log={l} />
            ))}
          </ul>
        )}
      </GlassCard>

      <Pagination
        page={page}
        pageCount={pageCount}
        disabled={isPending}
        onPage={(p) => setParams({ page: p })}
      />
    </div>
  );
}

function LogItem({ log }: { log: AuditRow }) {
  const [expanded, setExpanded] = useState(false);
  const meta = actionMeta(log.action);
  const Icon = meta.icon;

  let prettyDetail: string | null = null;
  if (log.detail) {
    try {
      prettyDetail = JSON.stringify(JSON.parse(log.detail), null, 2);
    } catch {
      prettyDetail = log.detail;
    }
  }

  return (
    <li>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="hover-surface flex w-full items-start gap-3 px-5 py-3.5 text-left"
      >
        <span
          className={cn(
            "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg",
            meta.tone === "accent" && "bg-accent-soft text-accent-ink",
            meta.tone === "emerald" && "bg-success-soft text-success-ink",
            meta.tone === "amber" && "bg-warn-soft text-warn-ink",
            meta.tone === "red" && "bg-danger-soft text-danger-ink",
            meta.tone === "cyan" && "bg-info-soft text-info-ink",
            meta.tone === "neutral" && "bg-surface-2 text-ink-500",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium text-ink">{log.actorName}</span>
            <Badge variant={ROLE_BADGE[log.actorRole as Role] ?? "neutral"}>
              {ROLE_LABELS[log.actorRole as Role] ?? log.actorRole}
            </Badge>
            <span className="text-[11px] uppercase tracking-wider text-ink-400">
              {meta.label}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[13px] text-ink-500">
            {log.summary ?? `${log.action} on ${log.entity}`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 text-right">
          <span
            className="text-[11px] text-ink-400"
            title={formatDate(log.createdAt)}
          >
            {timeAgo(log.createdAt)}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-ink-400 transition-transform",
              expanded && "rotate-180",
            )}
          />
        </div>
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-line/60 bg-surface-2/40 px-5 py-3 text-xs">
          <DetailRow label="Action" value={log.action} mono />
          <DetailRow label="Entity" value={`${log.entity}${log.entityId ? ` · ${log.entityId}` : ""}`} mono />
          {log.targetName && <DetailRow label="Target user" value={log.targetName} />}
          <DetailRow label="IP" value={log.ip ?? "—"} mono />
          <DetailRow label="Time" value={formatDate(log.createdAt)} />
          {prettyDetail && (
            <div>
              <p className="mb-1 font-medium text-ink-500">Detail</p>
              <pre className="overflow-x-auto rounded-lg border border-line bg-surface p-3 font-mono text-[11px] leading-relaxed text-ink-700">
                {prettyDetail}
              </pre>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <span className="w-24 shrink-0 text-ink-400">{label}</span>
      <span className={cn("text-ink-700", mono && "font-mono")}>{value}</span>
    </div>
  );
}

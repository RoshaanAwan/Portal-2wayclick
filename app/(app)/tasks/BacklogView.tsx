"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Play,
  CheckCircle2,
  Trash2,
  Inbox,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { IssueTypeIcon, IssueKey, StatusPill, PointsBadge } from "./issueUi";
import type { ListDTO, MemberDTO, SprintDTO, TaskDTO } from "./BoardClient";

// The JIRA backlog/sprint planner. Issues are grouped into their sprint (active
// or planned) or the Backlog. Managers can create/start/complete sprints and the
// rows let anyone move an issue between buckets (via the board's sprint patch).
export function BacklogView({
  lists,
  sprints,
  members,
  keyPrefix,
  boardId,
  isManager,
  matchesFilters,
  onOpenTask,
  onMoveToSprint,
}: {
  lists: ListDTO[];
  sprints: SprintDTO[];
  members: MemberDTO[];
  keyPrefix: string;
  boardId: string | null;
  isManager: boolean;
  matchesFilters: (t: TaskDTO) => boolean;
  onOpenTask: (taskId: string) => void;
  onMoveToSprint: (taskId: string, sprintId: string | null) => Promise<boolean>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // All issues across the board, after the filter bar.
  const allTasks = lists.flatMap((l) => l.tasks).filter(matchesFilters);

  const planningSprints = sprints.filter((s) => s.status !== "COMPLETED");
  const backlog = allTasks.filter((t) => t.sprintId === null);

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function sprintAction(
    sprintId: string,
    action: "start" | "complete" | "delete",
  ) {
    setBusy(sprintId);
    try {
      const res = await fetch("/api/sprints/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sprintId, action }),
      });
      if (res.ok) router.refresh();
      else {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Action failed");
      }
    } finally {
      setBusy(null);
    }
  }

  async function createSprint(e: React.FormEvent) {
    e.preventDefault();
    if (!boardId || !newName.trim() || busy) return;
    setBusy("create");
    try {
      const res = await fetch("/api/sprints/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId, name: newName.trim() }),
      });
      if (res.ok) {
        setNewName("");
        setCreating(false);
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  const points = (tasks: TaskDTO[]) =>
    tasks.reduce((n, t) => n + (t.storyPoints ?? 0), 0);

  return (
    <div className="space-y-4 pb-6">
      {planningSprints.map((sprint) => {
        const tasks = allTasks.filter((t) => t.sprintId === sprint.id);
        const isCollapsed = collapsed.has(sprint.id);
        const active = sprint.status === "ACTIVE";
        return (
          <section
            key={sprint.id}
            className={cn(
              "rounded-2xl border bg-surface",
              active ? "border-accent/30" : "border-line",
            )}
          >
            <header className="flex flex-wrap items-center gap-2 p-3">
              <button
                type="button"
                onClick={() => toggle(sprint.id)}
                className="grid h-6 w-6 place-items-center rounded text-ink-400 hover:text-ink"
                aria-label={isCollapsed ? "Expand" : "Collapse"}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
              <h3 className="text-sm font-semibold text-ink">{sprint.name}</h3>
              {active && (
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-ink">
                  Active
                </span>
              )}
              <span className="text-xs text-ink-400">
                {tasks.length} issue{tasks.length === 1 ? "" : "s"} ·{" "}
                {points(tasks)} pts
              </span>
              {sprint.goal && (
                <span className="hidden text-xs text-ink-400 sm:inline">
                  — {sprint.goal}
                </span>
              )}

              {isManager && (
                <div className="ml-auto flex items-center gap-1.5">
                  {sprint.status === "PLANNED" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      loading={busy === sprint.id}
                      disabled={tasks.length === 0}
                      onClick={() => sprintAction(sprint.id, "start")}
                    >
                      <Play className="h-3.5 w-3.5" />
                      Start
                    </Button>
                  )}
                  {active && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      loading={busy === sprint.id}
                      onClick={() => sprintAction(sprint.id, "complete")}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Complete
                    </Button>
                  )}
                  <button
                    type="button"
                    aria-label="Delete sprint"
                    onClick={() => sprintAction(sprint.id, "delete")}
                    className="grid h-7 w-7 place-items-center rounded-lg text-ink-400 hover:text-danger-ink"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </header>

            {!isCollapsed && (
              <div className="border-t border-line">
                {tasks.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-ink-400">
                    No issues in this sprint yet — move some up from the backlog.
                  </p>
                ) : (
                  tasks.map((t) => (
                    <IssueRow
                      key={t.id}
                      task={t}
                      sprints={planningSprints}
                      currentSprintId={sprint.id}
                      onOpen={() => onOpenTask(t.id)}
                      onMove={(sid) => onMoveToSprint(t.id, sid)}
                    />
                  ))
                )}
              </div>
            )}
          </section>
        );
      })}

      {/* Create sprint */}
      {isManager && boardId && (
        <div>
          {creating ? (
            <form
              onSubmit={createSprint}
              className="flex items-center gap-2 rounded-xl border border-line bg-surface p-2"
            >
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Sprint name (e.g. Sprint 12)"
                maxLength={120}
                className="h-8 flex-1 rounded-lg border border-line bg-surface-2 px-2.5 text-sm text-ink focus:border-accent/40 focus:outline-none"
              />
              <Button
                type="submit"
                size="sm"
                loading={busy === "create"}
                disabled={!newName.trim()}
              >
                Create
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                }}
              >
                Cancel
              </Button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-line px-3 py-2 text-xs font-medium text-ink-400 hover:text-ink"
            >
              <Plus className="h-4 w-4" />
              Create sprint
            </button>
          )}
        </div>
      )}

      {/* Backlog */}
      <section className="rounded-2xl border border-line bg-surface">
        <header className="flex items-center gap-2 p-3">
          <Inbox className="h-4 w-4 text-ink-400" />
          <h3 className="text-sm font-semibold text-ink">Backlog</h3>
          <span className="text-xs text-ink-400">
            {backlog.length} issue{backlog.length === 1 ? "" : "s"} ·{" "}
            {points(backlog)} pts
          </span>
        </header>
        <div className="border-t border-line">
          {backlog.length === 0 ? (
            <p className="px-4 py-3 text-xs text-ink-400">
              The backlog is empty.
            </p>
          ) : (
            backlog.map((t) => (
              <IssueRow
                key={t.id}
                task={t}
                sprints={planningSprints}
                currentSprintId={null}
                onOpen={() => onOpenTask(t.id)}
                onMove={(sid) => onMoveToSprint(t.id, sid)}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function IssueRow({
  task,
  sprints,
  currentSprintId,
  onOpen,
  onMove,
}: {
  task: TaskDTO;
  sprints: SprintDTO[];
  currentSprintId: string | null;
  onOpen: () => void;
  onMove: (sprintId: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-line px-4 py-2 last:border-b-0 hover:bg-surface-2/50">
      <IssueTypeIcon type={task.issueType} />
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 truncate text-left text-sm text-ink hover:text-accent-ink"
      >
        <IssueKey keyText={task.issueKey} className="mr-2" />
        {task.title}
      </button>

      <StatusPill status={task.status} />
      <PointsBadge points={task.storyPoints} />

      <div className="flex items-center -space-x-1.5">
        {task.assignees.slice(0, 3).map((a) => (
          <Avatar
            key={a.id}
            name={a.name}
            src={a.avatarUrl}
            size="xs"
            className="ring-2 ring-surface"
          />
        ))}
      </div>

      <select
        value={currentSprintId ?? ""}
        onChange={(e) => onMove(e.target.value || null)}
        onClick={(e) => e.stopPropagation()}
        className="h-7 max-w-[120px] rounded-lg border border-line bg-surface-2 px-1.5 text-[11px] text-ink-500 focus:border-accent/40 focus:outline-none"
        aria-label="Move to sprint"
      >
        <option value="">Backlog</option>
        {sprints.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}

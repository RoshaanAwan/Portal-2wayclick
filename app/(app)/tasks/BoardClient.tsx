"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, KanbanSquare, ListFilter, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ISSUE_TYPES,
  WORKFLOW_STATUSES,
  issueTypeLabel,
  statusLabel,
  type TaskPriority,
  type WorkflowStatus,
} from "@/lib/constants";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { IssueTypeIcon } from "./issueUi";
import { statusForListName } from "./statusMap";
import { TaskCard } from "./TaskCard";
import { EditTaskForm } from "./EditTaskForm";
import { AddTask } from "./AddTask";
import { TaskModal } from "./TaskModal";
import { BacklogView } from "./BacklogView";

export interface MemberDTO {
  id: string;
  name: string;
  avatarUrl: string | null;
  title: string;
}

export interface CommentDTO {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; avatarUrl: string | null };
}

// A linked issue, as rendered from one card's perspective. `direction` is
// "outward" when this card is the link's source, "inward" when it's the target —
// it picks the phrasing (issueLinkPhrasing).
export interface IssueLinkDTO {
  id: string;
  type: string;
  direction: "outward" | "inward";
  // The card on the other end of the link.
  issueKey: string;
  taskId: string;
  title: string;
  status: string;
  issueType: string;
}

export interface TaskDTO {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  position: number;
  dueDate: string | null;
  estimateMinutes: number | null;
  timeSpentMinutes: number;
  listId: string;
  // JIRA fields.
  issueNumber: number | null;
  issueKey: string;
  issueType: string;
  status: string;
  storyPoints: number | null;
  labels: string[];
  reporter: { id: string; name: string; avatarUrl: string | null } | null;
  sprintId: string | null;
  links: IssueLinkDTO[];
  creator: { id: string; name: string; avatarUrl: string | null };
  assignees: MemberDTO[];
  comments: CommentDTO[];
}

export interface ListDTO {
  id: string;
  name: string;
  position: number;
  tasks: TaskDTO[];
}

export interface SprintDTO {
  id: string;
  name: string;
  goal: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
}

interface DragState {
  taskId: string;
  fromListId: string;
}

export function BoardClient({
  lists: initialLists,
  members,
  sprints,
  boardId,
  keyPrefix,
  currentUserId,
  isManager,
}: {
  lists: ListDTO[];
  members: MemberDTO[];
  sprints: SprintDTO[];
  boardId: string | null;
  keyPrefix: string;
  currentUserId: string | null;
  isManager: boolean;
}) {
  const router = useRouter();
  const [lists, setLists] = useState<ListDTO[]>(initialLists);
  // Board (Kanban columns) vs Backlog (sprint planner) view.
  const [view, setView] = useState<"board" | "backlog">("board");
  // JIRA-style filters. Empty = no constraint.
  const [filterText, setFilterText] = useState("");
  const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set());
  const [filterStatuses, setFilterStatuses] = useState<Set<string>>(new Set());
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null);
  const [filterLabel, setFilterLabel] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dropHint, setDropHint] = useState<string | null>(null);
  // Column (list) drag — separate from card drag. Holds the dragged list id and
  // which list it's currently hovering before, for the drop indicator.
  const [listDrag, setListDrag] = useState<string | null>(null);
  const [listDropHint, setListDropHint] = useState<string | null>(null);
  // Which card's detail modal is open.
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  // Which card is being edited inline (swaps the card for the edit form).
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  // The card awaiting delete confirmation (drives the confirm dialog).
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  // "Only my cards" filter — cut the board down to what's assigned to me.
  const [onlyMine, setOnlyMine] = useState(false);

  // A card may be edited/deleted by its creator or any manager-tier user.
  const canManage = useCallback(
    (t: TaskDTO) =>
      isManager || (!!currentUserId && t.creator.id === currentUserId),
    [isManager, currentUserId],
  );

  // Re-sync local optimistic state when the server data changes. Keyed on the
  // full shape (lists, card order, assignees, comments) so any server update —
  // not just reordering — flows back in.
  const listsKey = useMemo(
    () =>
      initialLists
        .map(
          (l) =>
            `${l.id}:${l.tasks
              .map(
                (t) =>
                  `${t.id}#${t.assignees.map((a) => a.id).join("+")}#${t.comments.length}#${t.status}#${t.storyPoints}#${t.issueType}#${t.sprintId}#${t.labels.join(".")}#${t.links.length}`,
              )
              .join(",")}`,
        )
        .join("|"),
    [initialLists],
  );
  const [syncedKey, setSyncedKey] = useState(listsKey);
  if (syncedKey !== listsKey) {
    setSyncedKey(listsKey);
    setLists(initialLists);
  }

  const findTask = useCallback(
    (taskId: string): { list: ListDTO; task: TaskDTO } | null => {
      for (const list of lists) {
        const task = list.tasks.find((t) => t.id === taskId);
        if (task) return { list, task };
      }
      return null;
    },
    [lists],
  );

  // Apply an optimistic transform to one task, everywhere it lives in state.
  const patchTask = useCallback(
    (taskId: string, fn: (t: TaskDTO) => TaskDTO) => {
      setLists((prev) =>
        prev.map((l) => ({
          ...l,
          tasks: l.tasks.map((t) => (t.id === taskId ? fn(t) : t)),
        })),
      );
    },
    [],
  );

  // ── Assignment (optimistic; updates avatar stack + modal instantly) ────────
  const assign = useCallback(
    async (taskId: string, member: MemberDTO, shouldAssign: boolean) => {
      const snapshot = findTask(taskId)?.task.assignees ?? [];

      patchTask(taskId, (t) => ({
        ...t,
        assignees: shouldAssign
          ? t.assignees.some((a) => a.id === member.id)
            ? t.assignees
            : [...t.assignees, member]
          : t.assignees.filter((a) => a.id !== member.id),
      }));

      try {
        const res = await fetch(
          shouldAssign ? "/api/tasks/assign" : "/api/tasks/unassign",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId, userId: member.id }),
          },
        );
        if (!res.ok) throw new Error("assign failed");
        router.refresh();
      } catch {
        patchTask(taskId, (t) => ({ ...t, assignees: snapshot }));
      }
    },
    [findTask, patchTask, router],
  );

  // ── Comments (optimistic append, reconciled with the server's row) ─────────
  const addComment = useCallback(
    async (taskId: string, body: string): Promise<boolean> => {
      const tempId = `temp-${taskId}-${body.length}-${
        findTask(taskId)?.task.comments.length ?? 0
      }`;
      const me = members.find((m) => m.id === currentUserId);
      const optimistic: CommentDTO = {
        id: tempId,
        body,
        createdAt: new Date().toISOString(),
        author: {
          id: currentUserId ?? "",
          name: me?.name ?? "You",
          avatarUrl: me?.avatarUrl ?? null,
        },
      };

      patchTask(taskId, (t) => ({ ...t, comments: [...t.comments, optimistic] }));

      try {
        const res = await fetch("/api/tasks/comment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId, body }),
        });
        if (!res.ok) throw new Error("comment failed");
        const data = await res.json();
        // Swap the optimistic row for the real one from the server.
        patchTask(taskId, (t) => ({
          ...t,
          comments: t.comments.map((c) =>
            c.id === tempId && data.comment ? data.comment : c,
          ),
        }));
        router.refresh();
        return true;
      } catch {
        patchTask(taskId, (t) => ({
          ...t,
          comments: t.comments.filter((c) => c.id !== tempId),
        }));
        return false;
      }
    },
    [findTask, members, currentUserId, patchTask, router],
  );

  // ── Time tracking ("time lock") ────────────────────────────────────────────
  // `addMinutes` logs onto the card's pool (any editor); `setMinutes` is an
  // absolute reset (manager-only, enforced server-side). Optimistic, reverted
  // on failure.
  const logTime = useCallback(
    async (
      taskId: string,
      mode: "add" | "set",
      minutes: number,
      reason?: string,
    ): Promise<boolean> => {
      const snapshot = findTask(taskId)?.task;
      if (!snapshot) return false;

      const current = Number.isFinite(snapshot.timeSpentMinutes)
        ? snapshot.timeSpentMinutes
        : 0;
      const next = mode === "add" ? current + minutes : Math.max(0, minutes);
      patchTask(taskId, (t) => ({ ...t, timeSpentMinutes: next }));

      try {
        const res = await fetch("/api/tasks/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            taskId,
            ...(mode === "add"
              ? { addMinutes: minutes, ...(reason ? { reason } : {}) }
              : { timeSpentMinutes: Math.max(0, minutes) }),
          }),
        });
        if (!res.ok) throw new Error("time update failed");
        const data = await res.json();
        // A time log returns a "[time]" system comment — append it to the thread.
        if (data.comment) {
          patchTask(taskId, (t) => ({
            ...t,
            comments: [...t.comments, data.comment],
          }));
        }
        router.refresh();
        return true;
      } catch {
        patchTask(taskId, (t) => ({
          ...t,
          timeSpentMinutes: snapshot.timeSpentMinutes,
        }));
        return false;
      }
    },
    [findTask, patchTask, router],
  );

  // ── Edit (optimistic title/description/priority swap, reverted on failure) ──
  const updateTask = useCallback(
    async (
      taskId: string,
      title: string,
      description: string,
      priority: TaskPriority,
    ): Promise<boolean> => {
      const snapshot = findTask(taskId)?.task;
      if (!snapshot) return false;

      patchTask(taskId, (t) => ({
        ...t,
        title,
        description: description || null,
        priority,
      }));

      try {
        const res = await fetch("/api/tasks/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId, title, description, priority }),
        });
        if (!res.ok) throw new Error("update failed");
        router.refresh();
        return true;
      } catch {
        patchTask(taskId, (t) => ({
          ...t,
          title: snapshot.title,
          description: snapshot.description,
          priority: snapshot.priority,
        }));
        return false;
      }
    },
    [findTask, patchTask, router],
  );

  // ── JIRA issue fields (type / points / reporter / sprint / labels) ─────────
  // A general partial patch over /api/tasks/update. Applies the supplied keys
  // optimistically and reverts the touched keys on failure.
  const patchIssue = useCallback(
    async (
      taskId: string,
      payload: {
        issueType?: string;
        storyPoints?: number | null;
        reporterId?: string | null;
        sprintId?: string | null;
        labels?: string[];
      },
    ): Promise<boolean> => {
      const snapshot = findTask(taskId)?.task;
      if (!snapshot) return false;

      patchTask(taskId, (t) => ({
        ...t,
        ...(payload.issueType !== undefined ? { issueType: payload.issueType } : {}),
        ...(payload.storyPoints !== undefined
          ? { storyPoints: payload.storyPoints }
          : {}),
        ...(payload.reporterId !== undefined
          ? {
              reporter:
                payload.reporterId === null
                  ? null
                  : members.find((m) => m.id === payload.reporterId)
                    ? {
                        id: payload.reporterId,
                        name: members.find((m) => m.id === payload.reporterId)!.name,
                        avatarUrl: members.find((m) => m.id === payload.reporterId)!
                          .avatarUrl,
                      }
                    : t.reporter,
            }
          : {}),
        ...(payload.sprintId !== undefined ? { sprintId: payload.sprintId } : {}),
        ...(payload.labels !== undefined ? { labels: payload.labels } : {}),
      }));

      try {
        const res = await fetch("/api/tasks/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId, ...payload }),
        });
        if (!res.ok) throw new Error("issue update failed");
        router.refresh();
        return true;
      } catch {
        patchTask(taskId, (t) => ({
          ...t,
          issueType: snapshot.issueType,
          storyPoints: snapshot.storyPoints,
          reporter: snapshot.reporter,
          sprintId: snapshot.sprintId,
          labels: snapshot.labels,
        }));
        return false;
      }
    },
    [findTask, patchTask, members, router],
  );

  // ── Status workflow change (relocates the card to the matching column) ─────
  const changeStatus = useCallback(
    async (taskId: string, status: WorkflowStatus): Promise<boolean> => {
      const found = findTask(taskId);
      if (!found) return false;
      const snapshot = lists;

      // Optimistically move the card to the first column whose name maps to the
      // chosen status, mirroring the server. If none matches, just stamp status.
      const destList =
        lists.find((l) => statusForListName(l.name) === status) ?? null;

      setLists((prev) => {
        const moved: TaskDTO = { ...found.task, status };
        if (!destList || destList.id === found.task.listId) {
          return prev.map((l) => ({
            ...l,
            tasks: l.tasks.map((t) => (t.id === taskId ? moved : t)),
          }));
        }
        return prev.map((l) => {
          if (l.id === found.task.listId) {
            return { ...l, tasks: l.tasks.filter((t) => t.id !== taskId) };
          }
          if (l.id === destList.id) {
            return { ...l, tasks: [...l.tasks, { ...moved, listId: destList.id }] };
          }
          return l;
        });
      });

      try {
        const res = await fetch("/api/tasks/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId, status }),
        });
        if (!res.ok) throw new Error("status change failed");
        router.refresh();
        return true;
      } catch {
        setLists(snapshot);
        return false;
      }
    },
    [findTask, lists, router],
  );

  // ── Issue links ────────────────────────────────────────────────────────────
  const addLink = useCallback(
    async (
      taskId: string,
      targetKey: string,
      type: string,
    ): Promise<string | null> => {
      try {
        const res = await fetch("/api/tasks/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceId: taskId, targetKey, type }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          return data.error ?? "Couldn’t add link";
        }
        router.refresh();
        return null;
      } catch {
        return "Couldn’t add link";
      }
    },
    [router],
  );

  const removeLink = useCallback(
    async (taskId: string, linkId: string): Promise<boolean> => {
      patchTask(taskId, (t) => ({
        ...t,
        links: t.links.filter((l) => l.id !== linkId),
      }));
      try {
        const res = await fetch("/api/tasks/unlink", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ linkId }),
        });
        if (!res.ok) throw new Error("unlink failed");
        router.refresh();
        return true;
      } catch {
        router.refresh(); // pull the link back from the server
        return false;
      }
    },
    [patchTask, router],
  );

  // ── Delete ─────────────────────────────────────────────────────────────────
  // A delete request from a card or the modal opens an in-app confirm dialog
  // (styled to match the board, replacing the OS window.confirm). `deleteTarget`
  // holds the card awaiting confirmation; `deleting` drives the dialog spinner.
  const confirmDelete = useCallback(async () => {
    const target = deleteTarget;
    if (!target || deleting) return;
    setDeleting(true);

    const snapshot = lists;
    // Optimistically drop the card, then reconcile with the server.
    setLists((prev) =>
      prev.map((l) => ({
        ...l,
        tasks: l.tasks.filter((t) => t.id !== target.id),
      })),
    );

    try {
      const res = await fetch("/api/tasks/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: target.id }),
      });
      if (!res.ok) throw new Error("delete failed");
      if (openTaskId === target.id) setOpenTaskId(null);
      if (editingTaskId === target.id) setEditingTaskId(null);
      setDeleteTarget(null);
      router.refresh();
    } catch {
      setLists(snapshot); // restore on failure
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, deleting, lists, openTaskId, editingTaskId, router]);

  // ── Drag & drop ────────────────────────────────────────────────────────────
  const drop = useCallback(
    async (listId: string, beforeTaskId: string | null) => {
      if (!drag) return;
      const moving = findTask(drag.taskId);
      setDrag(null);
      setDropHint(null);
      if (!moving) return;

      const dest = lists.find((l) => l.id === listId);
      if (!dest) return;

      const destTasks = dest.tasks.filter((t) => t.id !== drag.taskId);
      const insertAt = beforeTaskId
        ? destTasks.findIndex((t) => t.id === beforeTaskId)
        : destTasks.length;
      const currentIndex = dest.tasks.findIndex((t) => t.id === drag.taskId);
      if (
        moving.list.id === listId &&
        currentIndex !== -1 &&
        (insertAt === currentIndex || insertAt === currentIndex + 1)
      ) {
        return;
      }

      const at = insertAt === -1 ? destTasks.length : insertAt;
      const afterId = destTasks[at]?.id ?? null;
      const beforeId = at > 0 ? destTasks[at - 1]?.id ?? null : null;

      const movedTask: TaskDTO = { ...moving.task, listId };
      setLists((prev) =>
        prev.map((l) => {
          if (l.id === moving.list.id && l.id !== listId) {
            return { ...l, tasks: l.tasks.filter((t) => t.id !== drag.taskId) };
          }
          if (l.id === listId) {
            const without = l.tasks.filter((t) => t.id !== drag.taskId);
            const idx = beforeTaskId
              ? without.findIndex((t) => t.id === beforeTaskId)
              : without.length;
            const insertIdx = idx === -1 ? without.length : idx;
            return {
              ...l,
              tasks: [
                ...without.slice(0, insertIdx),
                movedTask,
                ...without.slice(insertIdx),
              ],
            };
          }
          return l;
        }),
      );

      try {
        const res = await fetch("/api/tasks/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: drag.taskId, listId, beforeId, afterId }),
        });
        if (!res.ok) throw new Error("move failed");
        router.refresh();
      } catch {
        setLists(initialLists);
      }
    },
    [drag, findTask, lists, initialLists, router],
  );

  // ── List (column) drag & drop ──────────────────────────────────────────────
  // Reorder whole columns. `beforeListId` is the list to drop in front of (null
  // = drop at the right end). Optimistic, reverted on failure.
  const moveList = useCallback(
    async (beforeListId: string | null) => {
      const draggedId = listDrag;
      setListDrag(null);
      setListDropHint(null);
      if (!draggedId || draggedId === beforeListId) return;

      const ordered = lists;
      const from = ordered.findIndex((l) => l.id === draggedId);
      if (from === -1) return;
      const without = ordered.filter((l) => l.id !== draggedId);
      const insertAt = beforeListId
        ? without.findIndex((l) => l.id === beforeListId)
        : without.length;
      const at = insertAt === -1 ? without.length : insertAt;

      // No-op if it lands back in the same slot.
      const reordered = [
        ...without.slice(0, at),
        ordered[from],
        ...without.slice(at),
      ];
      if (reordered.every((l, i) => l.id === ordered[i].id)) return;

      // Neighbors in the destination order, for the fractional position.
      const beforeId = at > 0 ? without[at - 1]?.id ?? null : null;
      const afterId = without[at]?.id ?? null;

      const snapshot = lists;
      setLists(reordered);

      try {
        const res = await fetch("/api/projects/list/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listId: draggedId, beforeId, afterId }),
        });
        if (!res.ok) throw new Error("list move failed");
        router.refresh();
      } catch {
        setLists(snapshot); // restore on failure
      }
    },
    [listDrag, lists, router],
  );

  if (lists.length === 0) {
    return (
      <EmptyState
        icon={KanbanSquare}
        title="No board yet"
        description="Run the seed to create the launch board, or check back soon."
      />
    );
  }

  const openTask = openTaskId ? findTask(openTaskId)?.task ?? null : null;
  const openTaskList = openTaskId ? findTask(openTaskId)?.list ?? null : null;

  const isMine = (t: TaskDTO) =>
    !!currentUserId && t.assignees.some((a) => a.id === currentUserId);
  const mineCount = lists.reduce(
    (n, l) => n + l.tasks.filter(isMine).length,
    0,
  );

  // Every label currently in use, for the label filter dropdown.
  const allLabels = Array.from(
    new Set(lists.flatMap((l) => l.tasks.flatMap((t) => t.labels))),
  ).sort();

  // The active sprint drives the board view (JIRA shows the active sprint's
  // issues on the board; everything else lives in the backlog).
  const activeSprint = sprints.find((s) => s.status === "ACTIVE") ?? null;

  // The combined filter predicate (text + type + status + assignee + label).
  const text = filterText.trim().toLowerCase();
  const matchesFilters = (t: TaskDTO): boolean => {
    if (onlyMine && !isMine(t)) return false;
    if (filterTypes.size && !filterTypes.has(t.issueType)) return false;
    if (filterStatuses.size && !filterStatuses.has(t.status)) return false;
    if (filterAssignee && !t.assignees.some((a) => a.id === filterAssignee))
      return false;
    if (filterLabel && !t.labels.includes(filterLabel)) return false;
    if (text) {
      const hay = `${t.issueKey} ${t.title} ${t.description ?? ""} ${t.labels.join(" ")}`.toLowerCase();
      if (!hay.includes(text)) return false;
    }
    return true;
  };

  const filterActive =
    onlyMine ||
    !!text ||
    filterTypes.size > 0 ||
    filterStatuses.size > 0 ||
    !!filterAssignee ||
    !!filterLabel;

  const clearFilters = () => {
    setOnlyMine(false);
    setFilterText("");
    setFilterTypes(new Set());
    setFilterStatuses(new Set());
    setFilterAssignee(null);
    setFilterLabel(null);
  };

  const toggleIn = (
    set: Set<string>,
    value: string,
    setter: (s: Set<string>) => void,
  ) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  };

  return (
    <>
      {/* View toggle + "only mine" */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-line bg-surface-2 p-0.5 text-xs font-medium">
          {(["board", "backlog"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={cn(
                "rounded-full px-3.5 py-1.5 capitalize transition-colors",
                view === v
                  ? "bg-surface text-ink shadow-xs"
                  : "text-ink-400 hover:text-ink",
              )}
            >
              {v}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setOnlyMine((v) => !v)}
          aria-pressed={onlyMine}
          disabled={!currentUserId}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
            onlyMine
              ? "border-accent/30 bg-accent-soft text-accent-ink"
              : "border-line bg-surface-2 text-ink-500 hover:border-line-strong hover:text-ink",
          )}
        >
          <User className="h-3.5 w-3.5" />
          Only my issues
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              onlyMine ? "bg-accent/20" : "bg-surface text-ink-400",
            )}
          >
            {mineCount}
          </span>
        </button>
      </div>

      {/* Filter bar — search + type + status + assignee + label */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <ListFilter className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Search issues…"
            className="h-8 w-52 rounded-lg border border-line bg-surface-2 pl-8 pr-2 text-xs text-ink placeholder:text-ink-400 focus:border-accent/40 focus:outline-none"
          />
        </div>

        {/* Type chips */}
        <div className="flex items-center gap-1">
          {ISSUE_TYPES.map((ty) => (
            <button
              key={ty}
              type="button"
              onClick={() => toggleIn(filterTypes, ty, setFilterTypes)}
              aria-pressed={filterTypes.has(ty)}
              title={issueTypeLabel[ty]}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px] font-medium transition-colors",
                filterTypes.has(ty)
                  ? "border-accent/40 bg-accent-soft text-accent-ink"
                  : "border-line bg-surface-2 text-ink-500 hover:text-ink",
              )}
            >
              <IssueTypeIcon type={ty} />
            </button>
          ))}
        </div>

        {/* Status select */}
        <select
          value=""
          onChange={(e) => {
            if (e.target.value)
              toggleIn(filterStatuses, e.target.value, setFilterStatuses);
          }}
          className="h-8 rounded-lg border border-line bg-surface-2 px-2 text-xs text-ink-500 focus:border-accent/40 focus:outline-none"
        >
          <option value="">
            Status{filterStatuses.size ? ` (${filterStatuses.size})` : ""}
          </option>
          {WORKFLOW_STATUSES.map((s) => (
            <option key={s} value={s}>
              {filterStatuses.has(s) ? "✓ " : ""}
              {statusLabel[s]}
            </option>
          ))}
        </select>

        {/* Assignee select */}
        <select
          value={filterAssignee ?? ""}
          onChange={(e) => setFilterAssignee(e.target.value || null)}
          className="h-8 max-w-[160px] rounded-lg border border-line bg-surface-2 px-2 text-xs text-ink-500 focus:border-accent/40 focus:outline-none"
        >
          <option value="">Any assignee</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>

        {/* Label select (only when labels exist) */}
        {allLabels.length > 0 && (
          <select
            value={filterLabel ?? ""}
            onChange={(e) => setFilterLabel(e.target.value || null)}
            className="h-8 max-w-[160px] rounded-lg border border-line bg-surface-2 px-2 text-xs text-ink-500 focus:border-accent/40 focus:outline-none"
          >
            <option value="">Any label</option>
            {allLabels.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        )}

        {filterActive && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] font-medium text-ink-500 hover:text-ink"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      {/* Active filter pills (status set is multi-select, so surface them) */}
      {filterStatuses.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {Array.from(filterStatuses).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleIn(filterStatuses, s, setFilterStatuses)}
              className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent-ink"
            >
              {statusLabel[s as WorkflowStatus]}
              <X className="h-2.5 w-2.5" />
            </button>
          ))}
        </div>
      )}

      {view === "backlog" ? (
        <BacklogView
          lists={lists}
          sprints={sprints}
          members={members}
          keyPrefix={keyPrefix}
          boardId={boardId}
          isManager={isManager}
          matchesFilters={matchesFilters}
          onOpenTask={(id) => setOpenTaskId(id)}
          onMoveToSprint={(taskId, sprintId) =>
            patchIssue(taskId, { sprintId })
          }
        />
      ) : (
      <div className="-mx-1 flex gap-5 overflow-x-auto px-1 pb-4">
        {lists.map((list) => {
          // On the board, show the active sprint's issues (plus anything not in
          // any sprint) so a running sprint focuses the board; with no active
          // sprint, show everything. Then apply the filter bar.
          const inScope = (t: TaskDTO) =>
            !activeSprint || t.sprintId === activeSprint.id || t.sprintId === null;
          const visibleTasks = list.tasks.filter(
            (t) => inScope(t) && matchesFilters(t),
          );
          const isDropTarget = drag && dropHint?.startsWith(`${list.id}:`);
          const isListDragging = listDrag === list.id;
          const isListDropTarget = listDrag && listDropHint === list.id;
          return (
            <div
              key={list.id}
              className={cn(
                "relative flex w-[300px] shrink-0 flex-col rounded-2xl border bg-surface p-2 transition-colors",
                isDropTarget || isListDropTarget
                  ? "border-accent/30 bg-accent-soft/20"
                  : "border-line",
                isListDragging && "opacity-40",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                // A column drag in progress: mark this list as the drop-before
                // target. Otherwise it's a card drag landing at the list's end.
                if (listDrag) setListDropHint(list.id);
                else if (drag) setDropHint(`${list.id}:end`);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (listDrag) void moveList(list.id);
                else void drop(list.id, null);
              }}
            >
              {/* Column drop indicator (left edge) when reordering lists. */}
              {isListDropTarget && (
                <div className="absolute -left-2.5 inset-y-2 w-0.5 rounded-full bg-accent" />
              )}

              {/* Header doubles as the column drag handle. */}
              <div
                draggable
                onDragStart={() => {
                  setListDrag(list.id);
                  setDrag(null); // ensure card-drag isn't also active
                }}
                onDragEnd={() => {
                  setListDrag(null);
                  setListDropHint(null);
                }}
                className="group/header mb-2 flex cursor-grab items-center justify-between rounded-lg px-1.5 pt-0.5 pb-1 hover:bg-surface-2/60 active:cursor-grabbing"
              >
                <div className="flex min-w-0 items-center gap-1">
                  <GripVertical className="h-3.5 w-3.5 shrink-0 text-ink-400/40 opacity-0 transition-opacity group-hover/header:opacity-100" />
                  <h2 className="truncate text-[13px] font-semibold text-ink">
                    {list.name}
                  </h2>
                </div>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-400">
                  {visibleTasks.length}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-2 px-0.5">
                {visibleTasks.map((task) =>
                  editingTaskId === task.id ? (
                    <EditTaskForm
                      key={task.id}
                      task={task}
                      onSave={updateTask}
                      onCancel={() => setEditingTaskId(null)}
                    />
                  ) : (
                    <TaskCard
                      key={task.id}
                      task={task}
                      currentUserId={currentUserId}
                      canManage={canManage(task)}
                      dragging={drag?.taskId === task.id}
                      showDropHint={dropHint === `${list.id}:${task.id}`}
                      onOpen={() => setOpenTaskId(task.id)}
                      onEdit={() => setEditingTaskId(task.id)}
                      onDelete={() =>
                        setDeleteTarget({ id: task.id, title: task.title })
                      }
                      onDragStart={() =>
                        setDrag({ taskId: task.id, fromListId: list.id })
                      }
                      onDragEnd={() => {
                        setDrag(null);
                        setDropHint(null);
                      }}
                      onDragOverCard={(e) => {
                        // While reordering columns, let the event bubble to the
                        // list so its drop-before indicator shows.
                        if (listDrag) return;
                        e.preventDefault();
                        e.stopPropagation();
                        if (drag) setDropHint(`${list.id}:${task.id}`);
                      }}
                      onDropCard={(e) => {
                        if (listDrag) return; // column drop handled by the list
                        e.preventDefault();
                        e.stopPropagation();
                        void drop(list.id, task.id);
                      }}
                    />
                  ),
                )}

                {onlyMine && visibleTasks.length === 0 && (
                  <p className="px-1.5 py-2 text-[11px] text-ink-400">
                    Nothing assigned to you here.
                  </p>
                )}

                <div
                  className={
                    drag && dropHint === `${list.id}:end`
                      ? "h-9 rounded-xl border-2 border-dashed border-accent/40 bg-accent-soft/40"
                      : "min-h-[4px]"
                  }
                />

                {!filterActive && (
                  <AddTask
                    listId={list.id}
                    currentUserId={currentUserId}
                    defaultSprintId={activeSprint?.id ?? null}
                  />
                )}
              </div>
            </div>
          );
        })}

        {/* End drop-zone — appears while reordering columns so a list can be
            moved to the far right (drop before nothing). */}
        {listDrag && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setListDropHint("__end__");
            }}
            onDrop={(e) => {
              e.preventDefault();
              void moveList(null);
            }}
            className={cn(
              "w-16 shrink-0 self-stretch rounded-2xl border-2 border-dashed transition-colors",
              listDropHint === "__end__"
                ? "border-accent/50 bg-accent-soft/30"
                : "border-line/50",
            )}
            aria-hidden
          />
        )}
      </div>
      )}

      <TaskModal
        task={openTask}
        listName={openTaskList?.name ?? ""}
        members={members}
        sprints={sprints}
        currentUserId={currentUserId}
        canManage={!!openTask && canManage(openTask)}
        onClose={() => setOpenTaskId(null)}
        onAssign={assign}
        onAddComment={addComment}
        onLogTime={logTime}
        onChangeStatus={changeStatus}
        onPatchIssue={patchIssue}
        onAddLink={addLink}
        onRemoveLink={removeLink}
        onSaveDescription={(taskId, description) =>
          openTask
            ? updateTask(
                taskId,
                openTask.title,
                description,
                openTask.priority as TaskPriority,
              )
            : Promise.resolve(false)
        }
        onEdit={(taskId) => {
          setOpenTaskId(null);
          setEditingTaskId(taskId);
        }}
        onDelete={(taskId) =>
          openTask && setDeleteTarget({ id: taskId, title: openTask.title })
        }
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete card"
        message={
          <>
            Delete <strong>“{deleteTarget?.title}”</strong>? This removes the card
            and all its comments. This can’t be undone.
          </>
        }
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => !deleting && setDeleteTarget(null)}
      />
    </>
  );
}

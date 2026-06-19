"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, KanbanSquare, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { type TaskPriority } from "@/lib/constants";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TaskCard } from "./TaskCard";
import { EditTaskForm } from "./EditTaskForm";
import { AddTask } from "./AddTask";
import { TaskModal } from "./TaskModal";

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

interface DragState {
  taskId: string;
  fromListId: string;
}

export function BoardClient({
  lists: initialLists,
  members,
  currentUserId,
  isManager,
}: {
  lists: ListDTO[];
  members: MemberDTO[];
  currentUserId: string | null;
  isManager: boolean;
}) {
  const router = useRouter();
  const [lists, setLists] = useState<ListDTO[]>(initialLists);
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
                  `${t.id}#${t.assignees.map((a) => a.id).join("+")}#${t.comments.length}`,
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

  return (
    <>
      {/* Board toolbar */}
      <div className="mb-4 flex items-center justify-end">
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
          Only my cards
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

      <div className="-mx-1 flex gap-5 overflow-x-auto px-1 pb-4">
        {lists.map((list) => {
          const visibleTasks = onlyMine
            ? list.tasks.filter(isMine)
            : list.tasks;
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

                {!onlyMine && (
                  <AddTask listId={list.id} currentUserId={currentUserId} />
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

      <TaskModal
        task={openTask}
        listName={openTaskList?.name ?? ""}
        members={members}
        currentUserId={currentUserId}
        canManage={!!openTask && canManage(openTask)}
        onClose={() => setOpenTaskId(null)}
        onAssign={assign}
        onAddComment={addComment}
        onLogTime={logTime}
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

"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlignLeft,
  CalendarClock,
  Check,
  Clock,
  MessageSquare,
  Pencil,
  Plus,
  Send,
  Target,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  cn,
  formatDate,
  formatMinutes,
  parseDuration,
  timeAgo,
} from "@/lib/utils";
import {
  priorityLabel,
  priorityVariant,
  type TaskPriority,
} from "@/lib/constants";
import { AssigneePicker } from "./AssigneePicker";
import type { MemberDTO, TaskDTO } from "./BoardClient";

// Comments left by a client via the public share link are stored with an
// attribution marker — "[client:Jane @ Acme] message". Recognise it here so the
// team thread shows the client's name + a badge instead of the raw marker.
function parseClientComment(
  stored: string,
): { clientName: string; body: string } | null {
  if (!stored.startsWith("[client:")) return null;
  const close = stored.indexOf("]");
  if (close === -1) return null;
  return {
    clientName: stored.slice("[client:".length, close),
    body: stored.slice(close + 1).trimStart(),
  };
}

// Time-log entries are stored as system comments prefixed with "[time]" so the
// thread records who tracked time. Recognise the marker to render them with a
// clock badge instead of the raw text.
function parseTimeComment(stored: string): { body: string } | null {
  if (!stored.startsWith("[time]")) return null;
  return { body: stored.slice("[time]".length).trimStart() };
}

export function TaskModal({
  task,
  listName,
  members,
  currentUserId,
  canManage,
  onClose,
  onAssign,
  onAddComment,
  onLogTime,
  onSaveDescription,
  onEdit,
  onDelete,
}: {
  task: TaskDTO | null;
  listName: string;
  members: MemberDTO[];
  currentUserId: string | null;
  canManage: boolean;
  onClose: () => void;
  onAssign: (taskId: string, member: MemberDTO, shouldAssign: boolean) => void;
  onAddComment: (taskId: string, body: string) => Promise<boolean>;
  onLogTime: (
    taskId: string,
    mode: "add" | "set",
    minutes: number,
    reason?: string,
  ) => Promise<boolean>;
  onSaveDescription: (taskId: string, description: string) => Promise<boolean>;
  onEdit: (taskId: string) => void;
  onDelete: (taskId: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  // Time tracking: the free-text duration the user is logging ("2h 30m").
  const [timeDraft, setTimeDraft] = useState("");
  // Reason required when the new total would exceed the card's estimate.
  const [reasonDraft, setReasonDraft] = useState("");
  const [loggingTime, setLoggingTime] = useState(false);
  // Inline description editing — `editingDesc` holds the draft while open.
  const [editingDesc, setEditingDesc] = useState<string | null>(null);
  const [savingDesc, setSavingDesc] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  // Close the inline description editor whenever a different card is opened.
  const taskId = task?.id ?? null;
  useEffect(() => {
    setEditingDesc(null);
    setSavingDesc(false);
  }, [taskId]);

  async function saveDescription() {
    if (!task || savingDesc || editingDesc === null) return;
    const next = editingDesc.trim();
    // Nothing changed — just close the editor.
    if (next === (task.description ?? "").trim()) {
      setEditingDesc(null);
      return;
    }
    setSavingDesc(true);
    const ok = await onSaveDescription(task.id, next);
    setSavingDesc(false);
    if (ok) setEditingDesc(null);
  }

  // Close on Escape.
  useEffect(() => {
    if (!task) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [task, onClose]);

  // Auto-scroll the thread to the newest comment as it grows.
  const commentCount = task?.comments.length ?? 0;
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [commentCount]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !task || posting) return;
    setPosting(true);
    setDraft("");
    const ok = await onAddComment(task.id, body);
    if (!ok) setDraft(body); // restore on failure
    setPosting(false);
  }

  const priority = (task?.priority as TaskPriority) ?? "MEDIUM";
  // Live preview of the duration the user is typing, so they see "2h 30m" parse.
  const parsedDraft = parseDuration(timeDraft);
  // Coerce a missing/non-finite total to 0 (older cards, stale serialization).
  const tracked = Number.isFinite(task?.timeSpentMinutes)
    ? task!.timeSpentMinutes
    : 0;
  // If the card has an estimate and this entry pushes the total past it, a
  // reason is required before the time can be logged.
  const estimate = task?.estimateMinutes ?? null;
  // Already over budget (before any new entry) — drives the red total.
  const alreadyOver = estimate != null && tracked > estimate;
  const wouldExceed =
    estimate != null && !!parsedDraft && tracked + parsedDraft > estimate;
  const needsReason = wouldExceed && reasonDraft.trim().length === 0;

  async function logTime(e: React.FormEvent) {
    e.preventDefault();
    if (!task || loggingTime) return;
    const minutes = parseDuration(timeDraft);
    if (!minutes || minutes <= 0) return;
    // Block until a reason is given when this entry goes over the estimate.
    if (needsReason) return;
    setLoggingTime(true);
    const ok = await onLogTime(
      task.id,
      "add",
      minutes,
      wouldExceed ? reasonDraft.trim() : undefined,
    );
    if (ok) {
      setTimeDraft("");
      setReasonDraft("");
    }
    setLoggingTime(false);
  }

  async function resetTime() {
    if (!task || loggingTime) return;
    setLoggingTime(true);
    await onLogTime(task.id, "set", 0);
    setLoggingTime(false);
  }

  return (
    <AnimatePresence>
      {task && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/55 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="glass-strong relative z-10 my-auto w-full max-w-2xl overflow-hidden rounded-2xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-line p-5">
              <div className="min-w-0">
                <p className="eyebrow mb-1.5">{listName}</p>
                <h2 className="text-lg font-semibold leading-snug text-ink">
                  {task.title}
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {canManage && (
                  <>
                    <button
                      type="button"
                      onClick={() => onEdit(task.id)}
                      aria-label="Edit card"
                      className="hover-surface grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:text-ink"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(task.id)}
                      aria-label="Delete card"
                      className="hover-surface grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:text-danger-ink"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="hover-surface grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:text-ink"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-5">
              {/* Meta chips */}
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <Badge variant={priorityVariant[priority]}>
                  {priorityLabel[priority]} priority
                </Badge>
                {task.dueDate && (
                  <Badge variant="neutral">
                    <CalendarClock className="h-3 w-3" />
                    Due {formatDate(task.dueDate)}
                  </Badge>
                )}
                {tracked > 0 && (
                  <Badge variant="neutral">
                    <Clock className="h-3 w-3" />
                    {formatMinutes(tracked)} tracked
                  </Badge>
                )}
                {task.estimateMinutes != null && (
                  <Badge variant="neutral">
                    <Target className="h-3 w-3" />
                    {formatMinutes(task.estimateMinutes)} estimate
                  </Badge>
                )}
                <span className="text-[11px] text-ink-400">
                  Created by {task.creator.name}
                </span>
              </div>

              {/* Members / assignment */}
              <section className="mb-6">
                <div className="mb-2.5 flex items-center gap-2 text-ink-500">
                  <Users className="h-4 w-4" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide">
                    Members
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {task.assignees.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-2 rounded-full border border-line bg-surface-2 py-1 pl-1 pr-3"
                    >
                      <Avatar name={a.name} src={a.avatarUrl} size="xs" />
                      <span className="text-xs font-medium text-ink">
                        {a.name}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${a.name}`}
                        onClick={() => onAssign(task.id, a, false)}
                        className="ml-0.5 text-ink-400 transition-colors hover:text-danger-ink"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {task.assignees.length === 0 && (
                    <span className="text-xs text-ink-400">
                      No one assigned yet.
                    </span>
                  )}
                  <AssigneePicker
                    assigned={task.assignees}
                    members={members}
                    currentUserId={currentUserId}
                    onToggle={(member, shouldAssign) =>
                      onAssign(task.id, member, shouldAssign)
                    }
                  />
                </div>
              </section>

              {/* Description — the card's free-text detail, distinct from the
                  title. Managers can edit it inline via the pencil button. */}
              <section className="mb-6">
                <div className="mb-2 flex items-center justify-between gap-2 text-ink-500">
                  <div className="flex items-center gap-2">
                    <AlignLeft className="h-4 w-4" />
                    <h3 className="text-xs font-semibold uppercase tracking-wide">
                      Description
                    </h3>
                  </div>
                  {canManage && editingDesc === null && (
                    <button
                      type="button"
                      onClick={() => setEditingDesc(task.description ?? "")}
                      aria-label="Edit description"
                      className="hover-surface grid h-7 w-7 place-items-center rounded-lg text-ink-400 hover:text-ink"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {editingDesc !== null ? (
                  <div>
                    <textarea
                      value={editingDesc}
                      onChange={(e) => setEditingDesc(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setEditingDesc(null);
                        if (
                          (e.metaKey || e.ctrlKey) &&
                          e.key === "Enter"
                        ) {
                          e.preventDefault();
                          void saveDescription();
                        }
                      }}
                      rows={4}
                      maxLength={2000}
                      autoFocus
                      placeholder="Add a description (optional)…"
                      className="input resize-none text-sm"
                    />
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingDesc(null)}
                        disabled={savingDesc}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        loading={savingDesc}
                        onClick={() => void saveDescription()}
                      >
                        {!savingDesc && <Check className="h-4 w-4" />}
                        Save
                      </Button>
                    </div>
                  </div>
                ) : task.description?.trim() ? (
                  <p className="whitespace-pre-wrap break-words rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-sm leading-relaxed text-ink-700">
                    {task.description}
                  </p>
                ) : canManage ? (
                  <button
                    type="button"
                    onClick={() => setEditingDesc("")}
                    className="hover-surface w-full rounded-xl border border-dashed border-line px-3.5 py-3 text-left text-sm leading-relaxed text-ink-400"
                  >
                    No description yet. Click to add one.
                  </button>
                ) : (
                  <p className="rounded-xl border border-dashed border-line px-3.5 py-3 text-sm leading-relaxed text-ink-400">
                    No description yet.
                  </p>
                )}
              </section>

              {/* Time tracked — a single pool of logged minutes. Anyone who can
                  see the card can log time; managers can reset the total. */}
              <section className="mb-6">
                <div className="mb-2.5 flex items-center justify-between gap-2 text-ink-500">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <h3 className="text-xs font-semibold uppercase tracking-wide">
                      Time tracked
                    </h3>
                  </div>
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      alreadyOver ? "text-danger-ink" : "text-ink",
                    )}
                  >
                    {formatMinutes(tracked)}
                    {task.estimateMinutes != null && (
                      <span
                        className={cn(
                          "font-normal",
                          alreadyOver ? "text-danger-ink/70" : "text-ink-400",
                        )}
                      >
                        {" "}
                        / {formatMinutes(task.estimateMinutes)} est
                        {alreadyOver && " · over"}
                      </span>
                    )}
                  </span>
                </div>

                <form onSubmit={logTime}>
                  <div className="flex items-center gap-2">
                    <input
                      value={timeDraft}
                      onChange={(e) => setTimeDraft(e.target.value)}
                      placeholder="e.g. 2h 30m"
                      aria-label="Time to log"
                      className="input h-9 flex-1 text-sm"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="ghost"
                      loading={loggingTime}
                      disabled={!parsedDraft || parsedDraft <= 0 || needsReason}
                    >
                      {!loggingTime && <Plus className="h-4 w-4" />}
                      Log
                    </Button>
                    {canManage && tracked > 0 && (
                      <button
                        type="button"
                        onClick={resetTime}
                        disabled={loggingTime}
                        className="text-xs font-medium text-ink-400 transition-colors hover:text-danger-ink disabled:opacity-50"
                      >
                        Reset
                      </button>
                    )}
                  </div>

                  {/* Over-estimate reason — required before logging when this
                      entry pushes the total past the card's estimate. */}
                  {wouldExceed && (
                    <textarea
                      value={reasonDraft}
                      onChange={(e) => setReasonDraft(e.target.value)}
                      rows={2}
                      maxLength={500}
                      placeholder="This goes over the estimate — add a reason…"
                      aria-label="Reason for exceeding the estimate"
                      className="input mt-2 resize-none text-sm"
                    />
                  )}
                </form>

                {timeDraft.trim() && parsedDraft ? (
                  <p
                    className={cn(
                      "mt-1.5 text-[11px]",
                      wouldExceed ? "text-warn-ink" : "text-ink-400",
                    )}
                  >
                    Adds {formatMinutes(parsedDraft)} →{" "}
                    {formatMinutes(tracked + parsedDraft)} total
                    {wouldExceed &&
                      ` — over the ${formatMinutes(estimate!)} estimate`}
                    {needsReason && (
                      <span className="text-danger-ink">
                        {" "}
                        · reason required
                      </span>
                    )}
                  </p>
                ) : timeDraft.trim() ? (
                  <p className="mt-1.5 text-[11px] text-danger-ink">
                    Couldn’t read that — try “2h 30m”, “90m” or “1.5h”.
                  </p>
                ) : null}
              </section>

              {/* Comments */}
              <section>
                <div className="mb-3 flex items-center gap-2 text-ink-500">
                  <MessageSquare className="h-4 w-4" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide">
                    Comments
                  </h3>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink-400">
                    {task.comments.length}
                  </span>
                </div>

                <div ref={threadRef} className="mb-3 max-h-64 space-y-3 overflow-y-auto">
                  {task.comments.length === 0 ? (
                    <p className="py-2 text-xs text-ink-400">
                      No comments yet. Start the conversation below.
                    </p>
                  ) : (
                    task.comments.map((c) => {
                      const timeLog = parseTimeComment(c.body);
                      // Time-log entries render as a compact "who tracked what"
                      // line rather than a full comment bubble.
                      if (timeLog) {
                        return (
                          <div
                            key={c.id}
                            className="flex items-center gap-2 text-[11px] text-ink-500"
                          >
                            <Clock className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                            <span className="font-semibold text-ink-700">
                              {c.author.name}
                            </span>
                            <span className="min-w-0 break-words">
                              {timeLog.body}
                            </span>
                            <span className="shrink-0 text-[10px] text-ink-400">
                              · {timeAgo(c.createdAt)}
                            </span>
                          </div>
                        );
                      }
                      const client = parseClientComment(c.body);
                      return (
                        <div key={c.id} className="flex gap-2.5">
                          <Avatar
                            name={client ? client.clientName : c.author.name}
                            src={client ? null : c.author.avatarUrl}
                            size="xs"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <span className="text-xs font-semibold text-ink">
                                {client ? client.clientName : c.author.name}
                              </span>
                              {client && (
                                <Badge variant="amber" className="text-[9px]">
                                  Client
                                </Badge>
                              )}
                              <span className="text-[10px] text-ink-400">
                                {timeAgo(c.createdAt)}
                              </span>
                            </div>
                            <p className="mt-0.5 whitespace-pre-wrap break-words rounded-xl rounded-tl-sm border border-line bg-surface-2 px-3 py-2 text-sm leading-relaxed text-ink-700">
                              {client ? client.body : c.body}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Composer */}
                <form onSubmit={submit} className="flex items-start gap-2.5">
                  <Avatar
                    name={
                      members.find((m) => m.id === currentUserId)?.name ?? "You"
                    }
                    src={members.find((m) => m.id === currentUserId)?.avatarUrl}
                    size="xs"
                  />
                  <div className="flex-1">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void submit(e);
                        }
                      }}
                      rows={2}
                      maxLength={1000}
                      placeholder="Write a comment…  (Enter to send)"
                      className="input resize-none text-sm"
                    />
                    <div className="mt-2 flex justify-end">
                      <Button
                        type="submit"
                        size="sm"
                        loading={posting}
                        disabled={!draft.trim()}
                      >
                        {!posting && <Send className="h-4 w-4" />}
                        Comment
                      </Button>
                    </div>
                  </div>
                </form>
              </section>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

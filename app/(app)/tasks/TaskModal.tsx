"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlignLeft,
  CalendarClock,
  MessageSquare,
  Send,
  Users,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn, formatDate, timeAgo } from "@/lib/utils";
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

export function TaskModal({
  task,
  listName,
  members,
  currentUserId,
  onClose,
  onAssign,
  onAddComment,
}: {
  task: TaskDTO | null;
  listName: string;
  members: MemberDTO[];
  currentUserId: string | null;
  onClose: () => void;
  onAssign: (taskId: string, member: MemberDTO, shouldAssign: boolean) => void;
  onAddComment: (taskId: string, body: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

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
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="hover-surface grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-400 hover:text-ink"
              >
                <X className="h-4.5 w-4.5" />
              </button>
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

              {/* Description placeholder (kept minimal — title carries the card) */}
              <section className="mb-6">
                <div className="mb-2 flex items-center gap-2 text-ink-500">
                  <AlignLeft className="h-4 w-4" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide">
                    Details
                  </h3>
                </div>
                <p className="rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-sm leading-relaxed text-ink-500">
                  {task.title}
                </p>
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

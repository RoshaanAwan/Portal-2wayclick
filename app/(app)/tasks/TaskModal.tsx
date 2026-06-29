"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlignLeft,
  CalendarClock,
  Check,
  Clock,
  ImagePlus,
  MessageSquare,
  Paperclip,
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
  type WorkflowStatus,
} from "@/lib/constants";
import { AssigneePicker } from "./AssigneePicker";
import { IssueTypeIcon, IssueKey } from "./issueUi";
import { IssueDetailsPanel } from "./IssueDetailsPanel";
import type { MemberDTO, SprintDTO, TaskDTO } from "./BoardClient";

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

// @mentions are stored inline as `@[Name](userId)`. Render the comment body as a
// mix of plain text + highlighted mention chips so "@[Jane](u_1) ping" shows
// "@Jane ping" with the name styled, never the raw token.
const MENTION_RENDER_RE = /@\[([^\]]+)\]\(([a-zA-Z0-9_-]+)\)/g;
function renderCommentBody(body: string): React.ReactNode {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  MENTION_RENDER_RE.lastIndex = 0;
  while ((m = MENTION_RENDER_RE.exec(body)) !== null) {
    if (m.index > last) out.push(body.slice(last, m.index));
    out.push(
      <span
        key={`${m.index}-${m[2]}`}
        className="rounded bg-accent-soft px-1 font-medium text-accent-ink"
      >
        @{m[1]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < body.length) out.push(body.slice(last));
  return out.length > 0 ? out : body;
}

// Escape a name for safe use inside a RegExp (names can hold ., (, ), etc.).
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Build a regex that matches `@Name` for any of the picked mentions, longest
// name first so "@Ann Marie" wins over "@Ann". Returns null when nothing's been
// picked (so the composer renders as plain text). The capture group is the name.
function buildMentionMatcher(mentions: MemberDTO[]): RegExp | null {
  if (mentions.length === 0) return null;
  const names = [...new Set(mentions.map((m) => m.name))]
    .sort((a, b) => b.length - a.length)
    .map(escapeRe);
  return new RegExp(`@(${names.join("|")})`, "g");
}

// The textarea holds plain `@Name` for readability; on submit we re-encode each
// to the `@[Name](id)` form the server/notifications expect. Match the same set
// the composer recognises so only deliberately-picked mentions get encoded.
function encodeMentions(body: string, mentions: MemberDTO[]): string {
  const re = buildMentionMatcher(mentions);
  if (!re) return body;
  return body.replace(re, (_full, name: string) => {
    const member = mentions.find((m) => m.name === name);
    return member ? `@[${name}](${member.id})` : `@${name}`;
  });
}

// Mirror of the textarea contents that turns the plain `@Name` mentions into
// styled chips. It sits *behind* a transparent-text textarea sharing the exact
// same typography/padding/scroll, so the chip lines up perfectly over the real
// caret/selection — the composer equivalent of `renderCommentBody`. Because the
// field now holds `@Name` (not the wide `@[Name](id)`), chip and caret geometry
// match exactly. Trailing newline is padded so the mirror tracks the last line.
function renderComposerHighlights(
  body: string,
  mentions: MemberDTO[],
): React.ReactNode {
  const re = buildMentionMatcher(mentions);
  const out: React.ReactNode[] = [];
  if (re) {
    let last = 0;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(body)) !== null) {
      if (m.index > last) out.push(body.slice(last, m.index));
      out.push(
        <span
          key={`${m.index}-${m[1]}`}
          // No padding/font-weight change here: the chip must occupy the exact
          // same glyph width as the textarea's plain `@Name` so caret/selection
          // stay aligned. Colour + background alone reads as a chip.
          className="rounded bg-accent-soft text-accent-ink"
        >
          @{m[1]}
        </span>,
      );
      last = m.index + m[0].length;
    }
    if (last < body.length) out.push(body.slice(last));
  } else {
    out.push(body);
  }
  // Keep a trailing newline visible so the mirror grows with the textarea.
  if (body.endsWith("\n")) out.push("​");
  return out;
}

export function TaskModal({
  task,
  listName,
  members,
  sprints,
  currentUserId,
  canManage,
  detailLoading,
  onClose,
  onAssign,
  onAddComment,
  onAddAttachment,
  onRemoveAttachment,
  onLogTime,
  onChangeStatus,
  onPatchIssue,
  onAddLink,
  onRemoveLink,
  onSaveDescription,
  onSaveTitle,
  onDelete,
}: {
  task: TaskDTO | null;
  listName: string;
  members: MemberDTO[];
  sprints: SprintDTO[];
  currentUserId: string | null;
  canManage: boolean;
  // True while the card's full comments/attachments/links are being lazy-loaded
  // (the board only ships summary data). Drives the loading state in those
  // sections so an empty array reads as "loading", not "none".
  detailLoading: boolean;
  onClose: () => void;
  onAssign: (taskId: string, member: MemberDTO, shouldAssign: boolean) => void;
  onAddComment: (taskId: string, body: string) => Promise<boolean>;
  onAddAttachment: (taskId: string, file: File) => Promise<string | null>;
  onRemoveAttachment: (taskId: string, attachmentId: string) => Promise<boolean>;
  onLogTime: (
    taskId: string,
    mode: "add" | "set",
    minutes: number,
    reason?: string,
  ) => Promise<boolean>;
  onChangeStatus: (taskId: string, status: WorkflowStatus) => Promise<boolean>;
  onPatchIssue: (
    taskId: string,
    payload: {
      issueType?: string;
      storyPoints?: number | null;
      reporterId?: string | null;
      sprintId?: string | null;
      labels?: string[];
      dueDate?: string | null;
    },
  ) => Promise<boolean>;
  onAddLink: (
    taskId: string,
    targetKey: string,
    type: string,
  ) => Promise<string | null>;
  onRemoveLink: (taskId: string, linkId: string) => Promise<boolean>;
  onSaveDescription: (taskId: string, description: string) => Promise<boolean>;
  onSaveTitle: (taskId: string, title: string) => Promise<boolean>;
  onDelete: (taskId: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  // Image attachment upload state — `uploading` drives the spinner, `uploadError`
  // surfaces a Drive/validation failure inline.
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // The attachment awaiting delete confirmation (id), and the in-flight remove.
  const [removingId, setRemovingId] = useState<string | null>(null);
  // @mention autocomplete: when the caret is in a `@query` token, this holds the
  // query + the textarea position so picking inserts `@[Name](id)` in place.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  // Mentions picked into the current draft. The textarea holds the *plain*
  // `@Name` (so the field shows only `@Name`, no hidden id stretching the line);
  // we re-attach the id here and re-encode to `@[Name](id)` at submit time.
  const [pickedMentions, setPickedMentions] = useState<MemberDTO[]>([]);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  // Mirror behind the textarea that renders `@Name` mentions as chips.
  const highlightRef = useRef<HTMLDivElement>(null);
  // Time tracking: the free-text duration the user is logging ("2h 30m").
  const [timeDraft, setTimeDraft] = useState("");
  // Reason required when the new total would exceed the card's estimate.
  const [reasonDraft, setReasonDraft] = useState("");
  const [loggingTime, setLoggingTime] = useState(false);
  // Inline description editing — `editingDesc` holds the draft while open.
  const [editingDesc, setEditingDesc] = useState<string | null>(null);
  const [savingDesc, setSavingDesc] = useState(false);
  // Inline title editing — `editingTitle` holds the draft while open.
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [savingTitle, setSavingTitle] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  // Close the inline editors whenever a different card is opened.
  const taskId = task?.id ?? null;
  useEffect(() => {
    setEditingDesc(null);
    setSavingDesc(false);
    setEditingTitle(null);
    setSavingTitle(false);
    setDraft("");
    setUploadError(null);
    setMentionQuery(null);
    setPickedMentions([]);
  }, [taskId]);

  async function saveTitle() {
    if (!task || savingTitle || editingTitle === null) return;
    const next = editingTitle.trim();
    // Empty title isn't allowed; nothing changed — just close the editor.
    if (next.length === 0 || next === task.title.trim()) {
      setEditingTitle(null);
      return;
    }
    setSavingTitle(true);
    const ok = await onSaveTitle(task.id, next);
    setSavingTitle(false);
    if (ok) setEditingTitle(null);
  }

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
    const display = draft.trim();
    if (!display || !task || posting) return;
    // Re-encode plain `@Name` back to `@[Name](id)` for the server to store.
    const body = encodeMentions(display, pickedMentions);
    setPosting(true);
    setDraft("");
    setMentionQuery(null);
    setPickedMentions([]);
    const ok = await onAddComment(task.id, body);
    if (!ok) {
      // Restore the (plain) draft + mentions so the user can retry.
      setDraft(display);
      setPickedMentions(pickedMentions);
    }
    setPosting(false);
  }

  // ── Image attachment upload ──────────────────────────────────────────────────
  async function handleFiles(files: FileList | null) {
    if (!task || !files || files.length === 0) return;
    setUploadError(null);
    setUploading(true);
    // Upload sequentially so each gets its own optimistic prepend + clear error.
    for (const file of Array.from(files)) {
      const err = await onAddAttachment(task.id, file);
      if (err) {
        setUploadError(err);
        break;
      }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function removeAttachment(attachmentId: string) {
    if (!task || removingId) return;
    setRemovingId(attachmentId);
    await onRemoveAttachment(task.id, attachmentId);
    setRemovingId(null);
  }

  // ── @mention autocomplete ────────────────────────────────────────────────────
  // Only people on the card can be mentioned (creator + assignees) — that mirrors
  // who the server will actually notify.
  const mentionCandidates: MemberDTO[] = task
    ? [
        ...task.assignees,
        ...(task.creator &&
        !task.assignees.some((a) => a.id === task.creator.id)
          ? [
              {
                id: task.creator.id,
                name: task.creator.name,
                avatarUrl: task.creator.avatarUrl,
                title: "",
              },
            ]
          : []),
      ]
    : [];
  const mentionMatches =
    mentionQuery === null
      ? []
      : mentionCandidates
          .filter((m) =>
            m.name.toLowerCase().includes(mentionQuery.toLowerCase()),
          )
          .slice(0, 6);

  // Detect a `@query` token immediately before the caret and open the picker.
  function onComposerChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setDraft(value);
    const caret = e.target.selectionStart ?? value.length;
    const upto = value.slice(0, caret);
    // Match a trailing "@word" not preceded by a word char (so emails don't trip
    // it). The query is the run of non-space chars after the "@".
    const match = /(?:^|\s)@([^\s@]*)$/.exec(upto);
    if (match) {
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  }

  // Replace the active `@query` token with the encoded `@[Name](id)` mention.
  function pickMention(member: MemberDTO) {
    const el = composerRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? draft.length;
    const before = draft.slice(0, caret);
    const after = draft.slice(caret);
    const tokenStart = before.search(/(?:^|\s)@[^\s@]*$/);
    // Keep any leading whitespace the regex consumed before the "@".
    const at = before.indexOf("@", tokenStart);
    const head = draft.slice(0, at);
    // Insert the *plain* `@Name` (the id is tracked in pickedMentions and
    // re-attached at submit) so the field shows just `@Name`.
    const token = `@${member.name} `;
    const next = head + token + after;
    setDraft(next);
    setPickedMentions((prev) =>
      prev.some((m) => m.id === member.id) ? prev : [...prev, member],
    );
    setMentionQuery(null);
    // Restore focus + place the caret right after the inserted mention.
    requestAnimationFrame(() => {
      el.focus();
      const pos = (head + token).length;
      el.setSelectionRange(pos, pos);
    });
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
            className="glass-strong relative z-10 my-auto w-full max-w-4xl overflow-hidden rounded-2xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-line p-5">
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center gap-2">
                  <IssueTypeIcon type={task.issueType} className="h-4 w-4" />
                  <IssueKey keyText={task.issueKey} className="text-xs" />
                  <span className="text-ink-300">·</span>
                  <p className="eyebrow !mb-0">{listName}</p>
                </div>
                {editingTitle !== null ? (
                  <div className="flex w-full items-start gap-2">
                    <textarea
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setEditingTitle(null);
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void saveTitle();
                        }
                      }}
                      rows={2}
                      maxLength={200}
                      autoFocus
                      aria-label="Edit title"
                      className="input min-w-0 flex-1 resize-none text-lg font-semibold leading-snug"
                    />
                    <div className="flex shrink-0 items-center gap-1 pt-0.5">
                      <button
                        type="button"
                        onClick={() => void saveTitle()}
                        disabled={savingTitle}
                        aria-label="Save title"
                        className="hover-surface grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:text-ink disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingTitle(null)}
                        disabled={savingTitle}
                        aria-label="Cancel editing title"
                        className="hover-surface grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:text-ink disabled:opacity-50"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : canManage ? (
                  <button
                    type="button"
                    onClick={() => setEditingTitle(task.title)}
                    aria-label="Edit title"
                    className="hover-surface -mx-1.5 -my-0.5 block rounded-lg px-1.5 py-0.5 text-left"
                  >
                    <h2 className="text-lg font-semibold leading-snug text-ink">
                      {task.title}
                    </h2>
                  </button>
                ) : (
                  <h2 className="text-lg font-semibold leading-snug text-ink">
                    {task.title}
                  </h2>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {canManage && (
                  <button
                    type="button"
                    onClick={() => onDelete(task.id)}
                    aria-label="Delete card"
                    className="hover-surface grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:text-danger-ink"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
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

            <div className="grid max-h-[70vh] grid-cols-1 gap-5 overflow-y-auto p-5 md:grid-cols-[1fr_260px]">
              {/* Main column */}
              <div className="min-w-0">
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

              {/* Attachments — images uploaded to the card. Anyone with card
                  access can add; the uploader, card creator, or a manager can
                  remove (enforced server-side). */}
              <section className="mb-6">
                <div className="mb-2.5 flex items-center justify-between gap-2 text-ink-500">
                  <div className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4" />
                    <h3 className="text-xs font-semibold uppercase tracking-wide">
                      Attachments
                    </h3>
                    {task.attachmentCount > 0 && (
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-ink-400">
                        {task.attachmentCount}
                      </span>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    loading={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {!uploading && <ImagePlus className="h-4 w-4" />}
                    Add image
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    multiple
                    className="hidden"
                    onChange={(e) => void handleFiles(e.target.files)}
                  />
                </div>

                {uploadError && (
                  <p className="mb-2 text-[11px] text-danger-ink">{uploadError}</p>
                )}

                {detailLoading && task.attachments.length === 0 ? (
                  <p className="text-xs text-ink-400">Loading attachments…</p>
                ) : task.attachments.length === 0 ? (
                  <p className="text-xs text-ink-400">
                    No images yet. Add a screenshot or photo.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {task.attachments.map((a) => (
                      <div
                        key={a.id}
                        className="group relative overflow-hidden rounded-xl border border-line bg-surface-2"
                      >
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          title={a.name}
                          className="block"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={a.url}
                            alt={a.name}
                            className="aspect-video w-full object-cover transition-opacity group-hover:opacity-90"
                            loading="lazy"
                          />
                        </a>
                        <button
                          type="button"
                          onClick={() => void removeAttachment(a.id)}
                          disabled={removingId === a.id}
                          aria-label={`Remove ${a.name}`}
                          className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-lg bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-danger-ink group-hover:opacity-100 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-2 py-1 text-[10px] text-white/90">
                          {a.name}
                        </div>
                      </div>
                    ))}
                  </div>
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
                    {task.commentCount}
                  </span>
                </div>

                <div ref={threadRef} className="mb-3 max-h-64 space-y-3 overflow-y-auto">
                  {detailLoading && task.comments.length === 0 ? (
                    <p className="py-2 text-xs text-ink-400">Loading comments…</p>
                  ) : task.comments.length === 0 ? (
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
                              {client
                                ? client.body
                                : renderCommentBody(c.body)}
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
                  <div className="relative flex-1">
                    {/* @mention autocomplete — floats above the composer while a
                        `@query` token is active. Only card members appear. */}
                    {mentionQuery !== null && mentionMatches.length > 0 && (
                      <ul
                        role="listbox"
                        className="glass-strong absolute bottom-full z-20 mb-1 max-h-48 w-64 overflow-y-auto rounded-xl border border-line p-1 shadow-lg"
                      >
                        {mentionMatches.map((m, i) => (
                          <li key={m.id}>
                            <button
                              type="button"
                              // onMouseDown (not onClick) so the textarea doesn't
                              // blur and reset the caret before we read it.
                              onMouseDown={(e) => {
                                e.preventDefault();
                                pickMention(m);
                              }}
                              onMouseEnter={() => setMentionIndex(i)}
                              className={cn(
                                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm",
                                i === mentionIndex
                                  ? "bg-accent-soft text-accent-ink"
                                  : "hover-surface text-ink-700",
                              )}
                            >
                              <Avatar name={m.name} src={m.avatarUrl} size="xs" />
                              <span className="truncate">{m.name}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {/* Highlight overlay + textarea share this positioning box so
                        the overlay's `inset-0` covers only the text field (not the
                        button row below). The textarea on top has transparent text
                        (caret stays visible) so the user sees chips while still
                        editing/submitting the raw `@[Name](id)` tokens. */}
                    <div className="relative">
                    <div
                      aria-hidden
                      ref={highlightRef}
                      // Same box model as `.input` (padding/radius/text) minus
                      // the border/bg/ring — those stay on the textarea on top so
                      // the chrome (and focus ring) isn't doubled. `border` is
                      // kept transparent so the text box width matches exactly.
                      className="pointer-events-none absolute inset-0 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-transparent px-3.5 py-2.5 text-sm text-ink-700"
                    >
                      {renderComposerHighlights(draft, pickedMentions)}
                    </div>
                    <textarea
                      ref={composerRef}
                      value={draft}
                      onChange={onComposerChange}
                      onScroll={(e) => {
                        // Keep the mirror's scroll glued to the textarea's so
                        // chips stay aligned once the content overflows.
                        if (highlightRef.current) {
                          highlightRef.current.scrollTop =
                            e.currentTarget.scrollTop;
                        }
                      }}
                      onKeyDown={(e) => {
                        // Drive the mention picker with the keyboard when it's open.
                        if (mentionQuery !== null && mentionMatches.length > 0) {
                          if (e.key === "ArrowDown") {
                            e.preventDefault();
                            setMentionIndex(
                              (i) => (i + 1) % mentionMatches.length,
                            );
                            return;
                          }
                          if (e.key === "ArrowUp") {
                            e.preventDefault();
                            setMentionIndex(
                              (i) =>
                                (i - 1 + mentionMatches.length) %
                                mentionMatches.length,
                            );
                            return;
                          }
                          if (e.key === "Enter" || e.key === "Tab") {
                            e.preventDefault();
                            pickMention(mentionMatches[mentionIndex]);
                            return;
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setMentionQuery(null);
                            return;
                          }
                        }
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void submit(e);
                        }
                      }}
                      rows={2}
                      maxLength={1000}
                      placeholder="Write a comment…  (@ to mention, Enter to send)"
                      // Transparent text but visible caret — the overlay below
                      // supplies the rendered chips. `relative z-10` keeps the
                      // textarea on top so it stays clickable/focusable.
                      className="input relative z-10 resize-none break-words bg-transparent text-sm text-transparent caret-ink-700"
                    />
                    </div>
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

              {/* JIRA details sidebar */}
              <aside className="md:border-l md:border-line md:pl-5">
                <IssueDetailsPanel
                  task={task}
                  members={members}
                  sprints={sprints}
                  canManage={canManage}
                  canTransition={
                    canManage ||
                    (!!currentUserId &&
                      task.assignees.some((a) => a.id === currentUserId))
                  }
                  onChangeStatus={onChangeStatus}
                  onPatchIssue={onPatchIssue}
                  onAddLink={onAddLink}
                  onRemoveLink={onRemoveLink}
                />
              </aside>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

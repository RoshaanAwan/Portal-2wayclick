"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  HelpCircle,
  KanbanSquare,
  MessageSquarePlus,
  Plus,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Logo } from "@/components/ui/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { IssueTypeIcon, IssueKey } from "@/app/(app)/tasks/issueUi";
import { cn, timeAgo } from "@/lib/utils";
import type {
  ClientBoardDTO,
  ClientCardDTO,
} from "@/lib/clientShareTypes";

/** Where a newly-composed card should land. */
type AddTarget = { id: string; name: string };

/** Issue type the client may raise — a JIRA-like subset (no Epic/Subtask). */
type ClientIssueType = "TASK" | "STORY" | "BUG";
const CLIENT_ISSUE_TYPES: { type: ClientIssueType; label: string; hint: string }[] = [
  { type: "TASK", label: "Task", hint: "A piece of work to be done" },
  { type: "STORY", label: "Story", hint: "A feature or capability you'd like" },
  { type: "BUG", label: "Bug", hint: "Something that isn't working right" },
];

const priorityVariant: Record<string, "neutral" | "amber" | "red"> = {
  LOW: "neutral",
  MEDIUM: "amber",
  HIGH: "red",
};

// Left-edge priority stripe — mirrors the internal board's TaskCard so the
// client view reads identically (HIGH red, MEDIUM amber, LOW muted).
const STRIPE: Record<string, string> = {
  HIGH: "bg-danger",
  MEDIUM: "bg-warn",
  LOW: "bg-line-strong",
};

// The client's display name is asked once and remembered (this browser only) so
// they don't retype it on every comment / request.
const NAME_KEY = "twayclick.clientName";

export function SharedBoardClient({
  token,
  board,
}: {
  token: string;
  board: ClientBoardDTO;
}) {
  const [clientName, setClientName] = useState("");
  const [lists, setLists] = useState(board.lists);
  // Drag state: the card being dragged, and the live drop hint ("<listId>:<cardId>"
  // or "<listId>:end") so the column can show where it would land.
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<string | null>(null);
  // Snapshot to roll back to if a move's server write fails.
  const listsRef = useRef(lists);
  listsRef.current = lists;
  const [openCard, setOpenCard] = useState<ClientCardDTO | null>(null);
  // Which list the add-card composer targets (null = closed). Defaults to
  // Backlog for the header button; per-column buttons set their own list.
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null);
  // First-visit welcome. Defaults to false for SSR (avoids a hydration flash);
  // the effect below flips it on only when we have no remembered name yet.
  const [welcome, setWelcome] = useState(false);

  // Restore a remembered name on mount; greet first-time visitors.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(NAME_KEY);
      if (saved) {
        setClientName(saved);
      } else {
        // No name on record → this browser hasn't been here. Roll out the mat.
        setWelcome(true);
      }
    } catch {
      // private mode / disabled storage — greet them; we just re-ask the name.
      setWelcome(true);
    }
  }, []);

  const backlog = board.lists.find(
    (l) => l.id === board.backlogListId,
  );

  function rememberName(name: string) {
    setClientName(name);
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      /* ignore */
    }
  }

  // Merge a freshly-posted comment into local state so it shows without reload.
  function appendComment(cardId: string, comment: ClientCardDTO["comments"][number]) {
    setLists((prev) =>
      prev.map((l) => ({
        ...l,
        cards: l.cards.map((c) =>
          c.id === cardId ? { ...c, comments: [...c.comments, comment] } : c,
        ),
      })),
    );
    setOpenCard((c) =>
      c && c.id === cardId
        ? { ...c, comments: [...c.comments, comment] }
        : c,
    );
  }

  // Drop a newly-created card into its list so it shows without a reload.
  function insertCard(listId: string, card: ClientCardDTO) {
    setLists((prev) =>
      prev.map((l) =>
        l.id === listId ? { ...l, cards: [...l.cards, card] } : l,
      ),
    );
  }

  // ── Drag & drop ────────────────────────────────────────────────────────────
  // Mirrors the internal board: move a card into a list, before `beforeCardId`
  // (null = append). Optimistic, then POST; on failure we restore the snapshot.
  const drop = useCallback(
    async (listId: string, beforeCardId: string | null) => {
      const taskId = dragId;
      setDragId(null);
      setDropHint(null);
      if (!taskId) return;

      const snapshot = listsRef.current;
      const fromList = snapshot.find((l) =>
        l.cards.some((c) => c.id === taskId),
      );
      const moving = fromList?.cards.find((c) => c.id === taskId);
      if (!fromList || !moving) return;

      // Cards in the destination, minus the one we're moving.
      const destCards = (
        snapshot.find((l) => l.id === listId)?.cards ?? []
      ).filter((c) => c.id !== taskId);
      const insertAt = beforeCardId
        ? destCards.findIndex((c) => c.id === beforeCardId)
        : destCards.length;
      const at = insertAt === -1 ? destCards.length : insertAt;

      // No-op: dropped back exactly where it already was.
      const curIdx = fromList.cards.findIndex((c) => c.id === taskId);
      if (
        fromList.id === listId &&
        (at === curIdx || at === curIdx + 1)
      ) {
        return;
      }

      const afterId = destCards[at]?.id ?? null;
      const beforeId = at > 0 ? destCards[at - 1]?.id ?? null : null;

      // Optimistic reorder.
      setLists((prev) =>
        prev.map((l) => {
          if (l.id === fromList.id && l.id !== listId) {
            return { ...l, cards: l.cards.filter((c) => c.id !== taskId) };
          }
          if (l.id === listId) {
            const without = l.cards.filter((c) => c.id !== taskId);
            const idx = beforeCardId
              ? without.findIndex((c) => c.id === beforeCardId)
              : without.length;
            const insertIdx = idx === -1 ? without.length : idx;
            return {
              ...l,
              cards: [
                ...without.slice(0, insertIdx),
                moving,
                ...without.slice(insertIdx),
              ],
            };
          }
          return l;
        }),
      );

      try {
        const res = await fetch(`/api/shared/${token}/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientName: clientName.trim() || "Client",
            taskId,
            listId,
            beforeId,
            afterId,
          }),
        });
        if (!res.ok) throw new Error("move failed");
      } catch {
        setLists(snapshot); // restore the pre-drag order
      }
    },
    [dragId, token, clientName],
  );

  return (
    <div className="mx-auto min-h-screen max-w-[1400px] px-4 py-6 lg:px-8">
      {/* Brand + project header */}
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent-grad text-white">
            <KanbanSquare className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink">
              {board.name}
            </h1>
            <p className="mt-0.5 max-w-xl text-sm text-ink-400">
              {board.description ||
                "Shared with you — browse progress, comment on a card, or send a new request."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWelcome(true)}
            className="hover-surface inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-ink-400 transition-colors hover:text-ink"
          >
            <HelpCircle className="h-4 w-4" />
            How this works
          </button>
          {/* Clients have no account, so the board renders in their device's
              theme by default. This lets them flip light/dark themselves; the
              choice is remembered per-browser (same 2wc-theme key the portal
              uses) and applied before paint on return visits. */}
          <ThemeToggle />
          <Button
            size="sm"
            onClick={() => backlog && setAddTarget(backlog)}
            disabled={!backlog}
          >
            <Plus className="h-4 w-4" />
            Add card
          </Button>
          <Logo size="sm" />
        </div>
      </header>

      {/* Board columns — drag a card between lists to move it. Styled to mirror
          the internal project board (BoardClient): each column is a boxed
          bg-surface panel and cards sit on bg-surface-2 with a left priority
          stripe, so the client view looks identical to the team's view. */}
      <div className="-mx-1 flex gap-5 overflow-x-auto px-1 pb-4">
        {lists.map((list) => {
          const isEndTarget = dropHint === `${list.id}:end`;
          return (
            <div
              key={list.id}
              className={cn(
                "relative flex w-[300px] shrink-0 flex-col rounded-2xl border bg-surface p-2 transition-colors",
                isEndTarget ? "border-accent/30 bg-accent-soft/20" : "border-line",
              )}
              // Dropping over the column body (not a card) appends to the end.
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                setDropHint(`${list.id}:end`);
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop(list.id, null);
              }}
            >
              <div className="mb-2 flex items-center justify-between rounded-lg px-1.5 pt-0.5 pb-1">
                <h2 className="truncate text-[13px] font-semibold text-ink">
                  {list.name}
                </h2>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-400">
                  {list.cards.length}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-2 px-0.5">
                {list.cards.length === 0 && !dragId && (
                  <p className="rounded-xl border border-dashed border-line px-3 py-5 text-center text-[11px] text-ink-400">
                    Nothing here yet
                  </p>
                )}
                {list.cards.map((card) => (
                  <div
                    key={card.id}
                    className="relative"
                    // Hovering a card targets the slot *before* it.
                    onDragOver={(e) => {
                      if (!dragId) return;
                      e.preventDefault();
                      e.stopPropagation();
                      setDropHint(`${list.id}:${card.id}`);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      drop(list.id, card.id);
                    }}
                  >
                    {/* Drop indicator above this card */}
                    {dropHint === `${list.id}:${card.id}` && (
                      <div className="absolute -top-[5px] left-0 right-0 z-10 h-0.5 rounded-full bg-accent" />
                    )}
                    <button
                      draggable
                      onDragStart={(e) => {
                        setDragId(card.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setDropHint(null);
                      }}
                      onClick={() => setOpenCard(card)}
                      className={cn(
                        "group relative block w-full cursor-grab overflow-hidden rounded-xl border border-line-strong bg-surface-2 pl-3.5 pr-3 py-2.5 text-left shadow-xs transition-all hover:border-ink-300 active:cursor-grabbing",
                        dragId === card.id && "opacity-40",
                      )}
                    >
                      {/* Left priority stripe — matches the internal board. */}
                      <span
                        className={cn(
                          "absolute inset-y-0 left-0 w-1.5",
                          STRIPE[card.priority] ?? STRIPE.MEDIUM,
                        )}
                        aria-label={`${card.priority.toLowerCase()} priority`}
                      />
                      {/* JIRA-style header: type icon + stable key, like the
                          team's board (e.g. ⬛ TASK-1). */}
                      <div className="mb-1 flex items-center gap-1.5">
                        <IssueTypeIcon type={card.issueType} />
                        <IssueKey keyText={card.issueKey} />
                      </div>
                      <p className="text-sm font-medium leading-snug text-ink">
                        {card.title}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Badge
                          variant={priorityVariant[card.priority] ?? "neutral"}
                          className="text-[9px]"
                        >
                          {card.priority}
                        </Badge>
                        {card.comments.length > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-ink-400">
                            <MessageSquarePlus className="h-3 w-3" />
                            {card.comments.length}
                          </span>
                        )}
                      </div>
                    </button>
                  </div>
                ))}

                {/* Per-column add — drops a card straight into THIS list. */}
                <button
                  onClick={() => setAddTarget({ id: list.id, name: list.name })}
                  className="hover-surface flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line px-3 py-2 text-[11px] font-medium text-ink-400 transition-colors hover:text-ink"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add card
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-center text-[11px] text-ink-400">
        This is a private link shared with you. Anyone with the link can view
        this board, add and move cards, and post comments.
      </p>

      {/* First-visit welcome */}
      <AnimatePresence>
        {welcome && (
          <WelcomeModal
            projectName={board.name}
            clientName={clientName}
            onName={rememberName}
            onClose={() => setWelcome(false)}
          />
        )}
      </AnimatePresence>

      {/* Card detail + comment composer */}
      <AnimatePresence>
        {openCard && (
          <CardModal
            token={token}
            // Re-read from `lists` so the thread reflects appended comments.
            card={
              lists
                .flatMap((l) => l.cards)
                .find((c) => c.id === openCard.id) ?? openCard
            }
            clientName={clientName}
            onName={rememberName}
            onClose={() => setOpenCard(null)}
            onComment={(comment) => appendComment(openCard.id, comment)}
          />
        )}
      </AnimatePresence>

      {/* Add-card composer (header → Backlog, or a specific column) */}
      <AnimatePresence>
        {addTarget && (
          <AddCardModal
            token={token}
            target={addTarget}
            clientName={clientName}
            onName={rememberName}
            onClose={() => setAddTarget(null)}
            onCreated={(card) => insertCard(addTarget.id, card)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Name field shared by both modals ────────────────────────────────────────
function NameField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-ink-500">
        Your name
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={80}
        required
        placeholder="e.g. Jane @ Acme"
        className="input"
      />
    </div>
  );
}

function Backdrop({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

// ── Card detail + comments ──────────────────────────────────────────────────
function CardModal({
  token,
  card,
  clientName,
  onName,
  onClose,
  onComment,
}: {
  token: string;
  card: ClientCardDTO;
  clientName: string;
  onName: (v: string) => void;
  onClose: () => void;
  onComment: (c: ClientCardDTO["comments"][number]) => void;
}) {
  const [name, setName] = useState(clientName);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = name.trim().length >= 1 && body.trim().length >= 1;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setError("");

    const res = await fetch(`/api/shared/${token}/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taskId: card.id,
        clientName: name.trim(),
        body: body.trim(),
      }),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      onName(name.trim());
      if (data.comment) onComment(data.comment);
      setBody("");
      setLoading(false);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not post your comment.");
      setLoading(false);
    }
  }

  return (
    <Backdrop onClose={onClose}>
      <GlassCard strong hover={false} className="p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">
              {card.title}
            </h2>
            <Badge
              variant={priorityVariant[card.priority] ?? "neutral"}
              className="mt-1 text-[9px]"
            >
              {card.priority}
            </Badge>
          </div>
          <button
            onClick={onClose}
            className="hover-surface rounded-lg p-1.5 text-ink-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {card.description && (
          <p className="mb-4 whitespace-pre-wrap break-words rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm leading-relaxed text-ink-700">
            {card.description}
          </p>
        )}

        {/* Thread */}
        <div className="mb-3 max-h-56 space-y-3 overflow-y-auto">
          {card.comments.length === 0 ? (
            <p className="py-2 text-xs text-ink-400">
              No comments yet. Start the conversation below.
            </p>
          ) : (
            card.comments.map((c) => (
              <div key={c.id} className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="break-all text-xs font-semibold text-ink">
                    {c.authorName}
                  </span>
                  {c.isClient && (
                    <Badge variant="accent" className="text-[9px]">
                      You / client
                    </Badge>
                  )}
                  <span className="text-[10px] text-ink-400">
                    {timeAgo(c.createdAt)}
                  </span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words rounded-xl rounded-tl-sm border border-line bg-surface-2 px-3 py-2 text-sm leading-relaxed text-ink-700">
                  {c.body}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Composer */}
        <form onSubmit={submit} className="space-y-3">
          <NameField value={name} onChange={setName} />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={1000}
            rows={3}
            required
            placeholder="Add a comment…"
            className="input resize-y leading-relaxed"
          />
          {error && <p className="text-sm text-danger-ink">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit" size="sm" loading={loading} disabled={!canSubmit}>
              {!loading && <Send className="h-4 w-4" />}
              Post comment
            </Button>
          </div>
        </form>
      </GlassCard>
    </Backdrop>
  );
}

// ── Add a card ──────────────────────────────────────────────────────────────
function AddCardModal({
  token,
  target,
  clientName,
  onName,
  onClose,
  onCreated,
}: {
  token: string;
  /** The list this card will be added to. */
  target: AddTarget;
  clientName: string;
  onName: (v: string) => void;
  onClose: () => void;
  onCreated: (card: ClientCardDTO) => void;
}) {
  const [name, setName] = useState(clientName);
  const [issueType, setIssueType] = useState<ClientIssueType>("TASK");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const canSubmit = name.trim().length >= 1 && title.trim().length >= 2;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setError("");

    const res = await fetch(`/api/shared/${token}/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: name.trim(),
        title: title.trim(),
        body: body.trim() || undefined,
        listId: target.id,
        issueType,
      }),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      onName(name.trim());
      if (data.card) onCreated(data.card);
      // Reset the fields so "Add another" starts clean.
      setTitle("");
      setBody("");
      setIssueType("TASK");
      setDone(true);
      setLoading(false);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not add your card.");
      setLoading(false);
    }
  }

  return (
    <Backdrop onClose={onClose}>
      <GlassCard strong hover={false} className="p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent-grad text-white">
              <Plus className="h-[18px] w-[18px]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">Create issue</p>
              <p className="text-[11px] text-ink-400">
                Drops into{" "}
                <span className="font-medium text-ink-500">{target.name}</span>{" "}
                and notifies the team.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="hover-surface rounded-lg p-1.5 text-ink-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {done ? (
          <div className="py-6 text-center">
            <p className="text-sm font-semibold text-ink">
              Added to {target.name} 🎉
            </p>
            <p className="mt-1 text-xs text-ink-400">
              The team has been notified. Thanks, {name.trim()}!
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button size="sm" variant="glass" onClick={() => setDone(false)}>
                Add another
              </Button>
              <Button size="sm" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <NameField value={name} onChange={setName} />
            {/* JIRA-style issue-type picker. */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-500">
                Issue type
              </label>
              <div className="grid grid-cols-3 gap-2">
                {CLIENT_ISSUE_TYPES.map((t) => {
                  const active = issueType === t.type;
                  return (
                    <button
                      key={t.type}
                      type="button"
                      onClick={() => setIssueType(t.type)}
                      title={t.hint}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                        active
                          ? "border-accent/40 bg-accent-soft text-accent-ink"
                          : "border-line bg-surface-2 text-ink-500 hover:border-line-strong hover:text-ink",
                      )}
                    >
                      <IssueTypeIcon type={t.type} />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-500">
                Summary
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                required
                autoFocus
                placeholder="e.g. Add a contact form to the homepage"
                className="input"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-500">
                Details{" "}
                <span className="font-normal text-ink-400">(optional)</span>
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="Anything that helps the team understand it."
                className="input resize-y leading-relaxed"
              />
            </div>
            {error && <p className="text-sm text-danger-ink">{error}</p>}
            <div className="flex justify-end">
              <Button type="submit" size="sm" loading={loading} disabled={!canSubmit}>
                {!loading && <Plus className="h-4 w-4" />}
                Create in {target.name}
              </Button>
            </div>
          </form>
        )}
      </GlassCard>
    </Backdrop>
  );
}

// ── First-visit welcome ─────────────────────────────────────────────────────
function WelcomeModal({
  projectName,
  clientName,
  onName,
  onClose,
}: {
  projectName: string;
  clientName: string;
  onName: (v: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(clientName);

  function enter(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) onName(trimmed);
    // Saving the name is what marks this browser as "seen" — so a returning
    // client skips straight to the board next time.
    onClose();
  }

  return (
    <Backdrop onClose={onClose}>
      <GlassCard strong glow hover={false} className="overflow-hidden p-0">
        {/* Warm gradient banner */}
        <div className="relative bg-accent-grad px-6 py-7 text-white">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-white/80">
            <Sparkles className="h-3.5 w-3.5" />
            Welcome
          </div>
          <h2 className="mt-1.5 font-display text-2xl font-semibold">
            {projectName}
          </h2>
          <p className="mt-1 max-w-md text-sm text-white/85">
            Your project, live. This is your own window into how things are
            progressing — and your space to chime in.
          </p>
        </div>

        <div className="space-y-4 p-6">
          <ul className="space-y-2.5 text-sm text-ink-700">
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-ink">
                <KanbanSquare className="h-3.5 w-3.5" />
              </span>
              <span>
                <span className="font-medium text-ink">Follow the board</span> —
                see what's in progress, in review, and done.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-ink">
                <Plus className="h-3.5 w-3.5" />
              </span>
              <span>
                <span className="font-medium text-ink">Add or move cards</span>{" "}
                — drop one into any column to request work, capture an idea, or
                drag it to a new stage.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-ink">
                <MessageSquarePlus className="h-3.5 w-3.5" />
              </span>
              <span>
                <span className="font-medium text-ink">Comment</span> on any
                card to give feedback — the team is notified.
              </span>
            </li>
          </ul>

          <form onSubmit={enter} className="space-y-3 pt-1">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-500">
                What should we call you?
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                autoFocus
                placeholder="e.g. Jane @ Acme"
                className="input"
              />
              <p className="mt-1.5 text-[11px] text-ink-400">
                Shown next to your comments and cards. No account needed.
              </p>
            </div>
            <Button type="submit" className="w-full justify-center">
              {name.trim() ? `Let's go, ${name.trim()}` : "View the board"}
            </Button>
          </form>
        </div>
      </GlassCard>
    </Backdrop>
  );
}

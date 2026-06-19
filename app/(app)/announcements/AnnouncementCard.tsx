"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Pin,
  MessageCircle,
  SmilePlus,
  Send,
  Eye,
  Pencil,
  Trash2,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn, timeAgo } from "@/lib/utils";
import { AnnouncementEditor } from "./AnnouncementEditor";
import type {
  AnnouncementDTO,
  CurrentUser,
} from "./AnnouncementsClient";

const REACTION_EMOJIS = ["🎉", "🔥", "❤️", "👏", "🚀"] as const;

type BadgeVariant =
  | "accent"
  | "cyan"
  | "pink"
  | "emerald"
  | "neutral"
  | "amber"
  | "red";

const COVER_VARIANT: Record<string, BadgeVariant> = {
  accent: "accent",
  cyan: "cyan",
  pink: "pink",
  emerald: "emerald",
};

function coverVariant(coverColor: string): BadgeVariant {
  return COVER_VARIANT[coverColor] ?? "accent";
}

export function AnnouncementCard({
  announcement,
  currentUser,
  canManage,
  index,
}: {
  announcement: AnnouncementDTO;
  currentUser: CurrentUser | null;
  canManage: boolean;
  index: number;
}) {
  const router = useRouter();
  const [showComments, setShowComments] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);
  const [reactingTo, setReactingTo] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const variant = coverVariant(announcement.coverColor);

  async function remove() {
    if (deleting) return;
    setDeleting(true);
    const res = await fetch(`/api/announcements/${announcement.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setConfirmDelete(false);
      router.refresh();
    } else {
      setDeleting(false);
    }
  }

  // Aggregate reactions by emoji, and flag which the current user has chosen.
  const reactionGroups = useMemo(() => {
    const map = new Map<string, { count: number; mine: boolean }>();
    for (const r of announcement.reactions) {
      const cur = map.get(r.emoji) ?? { count: 0, mine: false };
      cur.count += 1;
      if (currentUser && r.userId === currentUser.id) cur.mine = true;
      map.set(r.emoji, cur);
    }
    // Preserve canonical emoji order.
    return REACTION_EMOJIS.filter((e) => map.has(e)).map((e) => ({
      emoji: e,
      ...map.get(e)!,
    }));
  }, [announcement.reactions, currentUser]);

  async function toggleReaction(emoji: string) {
    if (!currentUser || reactingTo) return;
    setReactingTo(emoji);
    const res = await fetch("/api/announcements/react", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ announcementId: announcement.id, emoji }),
    });
    setPickerOpen(false);
    if (res.ok) {
      router.refresh();
    }
    setReactingTo(null);
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    const body = commentText.trim();
    if (!body || posting) return;
    setPosting(true);
    const res = await fetch("/api/announcements/comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ announcementId: announcement.id, body }),
    });
    if (res.ok) {
      setCommentText("");
      router.refresh();
    }
    setPosting(false);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.35, ease: "easeOut", delay: index * 0.05 }}
    >
      <GlassCard
        strong={announcement.pinned}
        glow={announcement.pinned}
        hover={false}
        className="relative overflow-hidden p-6"
      >
        {/* Colored top-rule keyed to cover color */}
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 h-[3px]",
            variant === "accent" && "bg-accent/40",
            variant === "cyan" && "bg-info/40",
            variant === "pink" && "bg-accent/40",
            variant === "emerald" && "bg-success/40",
          )}
        />

        {/* Header: category + pinned + admin controls */}
        <div className="mb-3 flex items-center justify-between gap-3">
          <Badge variant={variant}>{announcement.category}</Badge>
          <div className="flex items-center gap-2">
            {announcement.pinned && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent">
                <Pin className="h-3.5 w-3.5 fill-accent" />
                Pinned
              </span>
            )}
            {canManage && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  aria-label="Edit announcement"
                  className="grid h-7 w-7 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  aria-label="Delete announcement"
                  className="grid h-7 w-7 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-danger-soft hover:text-danger-ink"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Title + body */}
        <h2 className="font-display text-lg font-semibold leading-snug tracking-tight text-ink">
          {announcement.title}
        </h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-700">
          {announcement.body}
        </p>

        {/* Author */}
        <div className="mt-4 flex items-center gap-2.5">
          <Avatar
            name={announcement.author.name}
            src={announcement.author.avatarUrl}
            size="sm"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">
              {announcement.author.name}
            </p>
            <p className="truncate text-[11px] text-ink-400">
              {announcement.author.title} · {timeAgo(announcement.createdAt)}
            </p>
          </div>
        </div>

        {/* Footer: reactions + comments */}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {reactionGroups.map((g) => (
            <button
              key={g.emoji}
              onClick={() => toggleReaction(g.emoji)}
              disabled={!currentUser || reactingTo !== null}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed",
                g.mine
                  ? "border-accent/30 bg-accent-soft text-accent-ink"
                  : "border-line bg-surface-2 text-ink-500 hover:border-line-strong hover:text-ink",
              )}
              title={g.mine ? "Remove your reaction" : "React"}
            >
              <span className="text-sm leading-none">{g.emoji}</span>
              <span className="tabular-nums">{g.count}</span>
            </button>
          ))}

          {/* Emoji picker trigger */}
          {currentUser && (
            <div className="relative">
              <button
                onClick={() => setPickerOpen((o) => !o)}
                aria-label="Add reaction"
                aria-expanded={pickerOpen}
                className="grid h-7 w-7 place-items-center rounded-full border border-line bg-surface-2 text-ink-400 transition-colors hover:border-line-strong hover:text-ink"
              >
                <SmilePlus className="h-4 w-4" />
              </button>
              <AnimatePresence>
                {pickerOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setPickerOpen(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.9 }}
                      transition={{ duration: 0.15 }}
                      className="absolute bottom-9 right-0 z-20 flex max-w-[calc(100vw-2.5rem)] flex-wrap gap-1 rounded-xl border border-line bg-surface p-1.5 shadow-pop"
                    >
                      {REACTION_EMOJIS.map((emoji) => {
                        const mine = reactionGroups.find(
                          (g) => g.emoji === emoji,
                        )?.mine;
                        return (
                          <button
                            key={emoji}
                            onClick={() => toggleReaction(emoji)}
                            disabled={reactingTo !== null}
                            className={cn(
                              "grid h-8 w-8 place-items-center rounded-lg text-base transition-transform hover:scale-125 disabled:opacity-50",
                              mine && "bg-accent-soft",
                            )}
                          >
                            {emoji}
                          </button>
                        );
                      })}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          )}

          <div className="flex-1" />

          {announcement.readCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-ink-400">
              <Eye className="h-3.5 w-3.5" />
              {announcement.readCount}
            </span>
          )}

          <button
            onClick={() => setShowComments((s) => !s)}
            aria-expanded={showComments}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
              showComments
                ? "text-accent"
                : "text-ink-500 hover:text-ink",
            )}
          >
            <MessageCircle className="h-4 w-4" />
            {announcement.commentCount}
            <span className="hidden sm:inline">
              {announcement.commentCount === 1 ? "comment" : "comments"}
            </span>
          </button>
        </div>

        {/* Comments thread */}
        <AnimatePresence initial={false}>
          {showComments && (
            <motion.div
              key="comments"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div className="mt-4 space-y-4 border-t border-line pt-4">
                {announcement.comments.length === 0 ? (
                  <p className="text-xs text-ink-400">
                    No comments yet. Be the first to reply.
                  </p>
                ) : (
                  announcement.comments.map((c) => (
                    <div key={c.id} className="flex gap-2.5">
                      <Avatar
                        name={c.author.name}
                        src={c.author.avatarUrl}
                        size="xs"
                      />
                      <div className="min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2">
                        <div className="flex items-baseline gap-2">
                          <p className="truncate text-xs font-medium text-ink">
                            {c.author.name}
                          </p>
                          <p className="shrink-0 text-[10px] text-ink-400">
                            {timeAgo(c.createdAt)}
                          </p>
                        </div>
                        <p className="mt-0.5 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                          {c.body}
                        </p>
                      </div>
                    </div>
                  ))
                )}

                {/* Comment composer */}
                {currentUser && (
                  <form
                    onSubmit={submitComment}
                    className="flex items-center gap-2.5 pt-1"
                  >
                    <Avatar
                      name={currentUser.name}
                      src={currentUser.avatarUrl}
                      size="xs"
                    />
                    <input
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      maxLength={1000}
                      placeholder="Write a comment…"
                      className="input flex-1 py-2"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="glass"
                      loading={posting}
                      disabled={!commentText.trim()}
                      aria-label="Post comment"
                      className="h-9 w-9 px-0"
                    >
                      {!posting && <Send className="h-4 w-4" />}
                    </Button>
                  </form>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      {canManage && (
        <>
          <AnnouncementEditor
            announcement={announcement}
            open={editing}
            onClose={() => setEditing(false)}
          />
          <ConfirmDialog
            open={confirmDelete}
            title="Delete announcement"
            message={
              <>
                Delete “{announcement.title}”? This also removes all comments and
                reactions, and can’t be undone.
              </>
            }
            loading={deleting}
            onConfirm={remove}
            onClose={() => setConfirmDelete(false)}
          />
        </>
      )}
    </motion.div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Megaphone, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ANNOUNCEMENT_CATEGORIES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { AnnouncementCard } from "./AnnouncementCard";
import { Composer } from "./Composer";

export interface CommentDTO {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; avatarUrl: string | null };
}

export interface ReactionDTO {
  id: string;
  emoji: string;
  userId: string;
}

export interface AnnouncementDTO {
  id: string;
  title: string;
  body: string;
  category: string;
  pinned: boolean;
  coverColor: string;
  createdAt: string;
  author: {
    id: string;
    name: string;
    title: string;
    avatarUrl: string | null;
  };
  reactions: ReactionDTO[];
  readCount: number;
  commentCount: number;
  reactionCount: number;
  comments: CommentDTO[];
}

export interface CurrentUser {
  id: string;
  name: string;
  role: string;
  avatarUrl: string | null;
}

const FILTERS = ["All", ...ANNOUNCEMENT_CATEGORIES] as const;

export function AnnouncementsClient({
  announcements,
  currentUser,
  canPost,
}: {
  announcements: AnnouncementDTO[];
  currentUser: CurrentUser | null;
  canPost: boolean;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [composerOpen, setComposerOpen] = useState(false);

  const visible = useMemo(() => {
    if (filter === "All") return announcements;
    return announcements.filter((a) => a.category === filter);
  }, [announcements, filter]);

  // Keep pinned posts first within the filtered set (data already ordered,
  // but recompute defensively for the animated layout).
  const ordered = useMemo(
    () =>
      [...visible].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.createdAt.localeCompare(a.createdAt);
      }),
    [visible],
  );

  return (
    <div>
      {/* Action row: New post + filter chips */}
      <div className="mb-6 flex flex-col gap-4">
        {canPost && (
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => setComposerOpen((o) => !o)}
              aria-expanded={composerOpen}
            >
              {composerOpen ? (
                <>
                  <X className="h-4 w-4" />
                  Cancel
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  New post
                </>
              )}
            </Button>
          </div>
        )}

        <AnimatePresence initial={false}>
          {composerOpen && canPost && currentUser && (
            <motion.div
              key="composer"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <Composer
                currentUser={currentUser}
                onDone={() => setComposerOpen(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Category filter chips */}
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "relative rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-transparent text-accent-ink"
                    : "border-line bg-surface-2 text-ink-500 hover:border-line-strong hover:text-ink",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="ann-filter-active"
                    className="absolute inset-0 rounded-full bg-accent-soft ring-1 ring-inset ring-accent/15"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{f}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Feed */}
      {ordered.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements here"
          description={
            filter === "All"
              ? "Nothing has been posted yet. Check back soon."
              : `No posts in “${filter}”. Try another category.`
          }
        />
      ) : (
        <motion.div layout className="space-y-5">
          <AnimatePresence mode="popLayout" initial={false}>
            {ordered.map((a, i) => (
              <AnnouncementCard
                key={a.id}
                announcement={a}
                currentUser={currentUser}
                index={i}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}

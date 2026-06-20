"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Plus, Users, FolderKanban } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn, timeAgo } from "@/lib/utils";
import {
  useMessaging,
  type ChatConversation,
} from "@/components/MessagingProvider";
import { ThreadPane } from "./ThreadPane";
import { NewConversationDialog } from "./NewConversationDialog";

// ── Conversation display helpers ──────────────────────────────────────────────
// A DM shows the OTHER member; a group/project shows its title. These derive a
// label + avatar source for a conversation given the current user.

export function conversationLabel(
  c: ChatConversation,
  meId: string,
): { name: string; avatar: string | null; subtitle: string | null; group: boolean } {
  if (c.kind === "dm") {
    const other = c.members.find((m) => m.id !== meId) ?? c.members[0];
    return {
      name: other?.name ?? "Conversation",
      avatar: other?.avatarUrl ?? null,
      subtitle: other?.title ?? null,
      group: false,
    };
  }
  const others = c.members.filter((m) => m.id !== meId);
  return {
    name: c.title ?? "Untitled",
    avatar: null,
    subtitle:
      c.kind === "project"
        ? "Project channel"
        : `${c.members.length} member${c.members.length === 1 ? "" : "s"}`,
    group: true,
  };
}

export function MessagesClient() {
  const {
    me,
    conversations,
    loadingConversations,
    activeId,
    setActiveId,
    refresh,
    setMessagingViewOpen,
  } = useMessaging();
  const router = useRouter();
  const params = useSearchParams();
  const [showNew, setShowNew] = useState(false);

  // While this page is mounted, let the provider run the periodic conversation
  // -list reconcile (read receipts / ordering). Off-page that reconcile is paused
  // to cut redundant DB load — the unread badge stays live via the message poll.
  useEffect(() => {
    setMessagingViewOpen(true);
    return () => setMessagingViewOpen(false);
  }, [setMessagingViewOpen]);

  // Deep-link support: ?c=<id> opens that conversation (from a notification).
  const urlC = params.get("c");
  useEffect(() => {
    if (urlC && urlC !== activeId) setActiveId(urlC);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlC]);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  function open(id: string) {
    setActiveId(id);
    // Reflect in the URL so the thread is shareable / survives reload.
    router.replace(`/messages?c=${id}`, { scroll: false });
  }

  async function onCreated(id: string) {
    setShowNew(false);
    await refresh();
    open(id);
  }

  return (
    <div className="mx-auto h-[calc(100vh-7.5rem)] max-w-6xl">
      <div className="glass flex h-full overflow-hidden p-0">
        {/* ── List pane ── (hidden on mobile when a thread is open) */}
        <aside
          className={cn(
            "flex w-full flex-col border-line lg:w-80 lg:border-r",
            active && "hidden lg:flex",
          )}
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
            <h1 className="font-display text-base font-semibold text-ink">
              Messages
            </h1>
            <button
              onClick={() => setShowNew(true)}
              aria-label="New conversation"
              className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-white transition hover:brightness-110"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {loadingConversations ? (
              <ConversationListSkeleton />
            ) : conversations.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <MessageSquare className="mx-auto mb-2 h-6 w-6 text-ink-300" />
                <p className="text-sm text-ink-400">No conversations yet</p>
                <button
                  onClick={() => setShowNew(true)}
                  className="mt-3 text-[13px] font-medium text-accent hover:underline"
                >
                  Start one
                </button>
              </div>
            ) : (
              conversations.map((c) => (
                <ConversationRow
                  key={c.id}
                  c={c}
                  meId={me.id}
                  active={c.id === activeId}
                  onClick={() => open(c.id)}
                />
              ))
            )}
          </div>
        </aside>

        {/* ── Thread pane ── */}
        <section
          className={cn(
            "min-w-0 flex-1 flex-col",
            active ? "flex" : "hidden lg:flex",
          )}
        >
          {active ? (
            <ThreadPane
              key={active.id}
              conversation={active}
              meId={me.id}
              onBack={() => {
                setActiveId(null);
                router.replace("/messages", { scroll: false });
              }}
            />
          ) : (
            <div className="hidden flex-1 flex-col items-center justify-center gap-2 lg:flex">
              <MessageSquare className="h-8 w-8 text-ink-300" />
              <p className="text-sm text-ink-400">
                Select a conversation to start chatting
              </p>
            </div>
          )}
        </section>
      </div>

      <AnimatePresence>
        {showNew && (
          <NewConversationDialog
            onClose={() => setShowNew(false)}
            onCreated={onCreated}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ConversationRow({
  c,
  meId,
  active,
  onClick,
}: {
  c: ChatConversation;
  meId: string;
  active: boolean;
  onClick: () => void;
}) {
  const { name, avatar, group } = conversationLabel(c, meId);
  const preview = c.lastMessage
    ? (c.lastMessage.senderId === meId ? "You: " : "") + c.lastMessage.body
    : "No messages yet";

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
        active ? "bg-surface-2" : "hover-surface",
      )}
    >
      {group ? (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink">
          {c.kind === "project" ? (
            <FolderKanban className="h-5 w-5" />
          ) : (
            <Users className="h-5 w-5" />
          )}
        </span>
      ) : (
        <Avatar name={name} src={avatar} size="md" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-semibold text-ink">{name}</p>
          {c.lastMessage && (
            <span className="shrink-0 text-[10px] text-ink-400">
              {timeAgo(c.lastMessage.createdAt)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <p
            className={cn(
              "truncate text-[12px]",
              c.unread > 0 ? "font-medium text-ink-700" : "text-ink-400",
            )}
          >
            {preview}
          </p>
          {c.unread > 0 && (
            <span className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-white">
              {c.unread > 9 ? "9+" : c.unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// Shimmer placeholders shown while the first conversation-list load is in flight.
function ConversationListSkeleton() {
  return (
    <div className="py-1" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-2.5 w-8" />
            </div>
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}

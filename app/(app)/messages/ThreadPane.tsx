"use client";

import { useState } from "react";
import {
  ArrowLeft,
  Send,
  Loader2,
  Users,
  FolderKanban,
  AlertCircle,
  RotateCw,
  Eye,
  Check,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { useMessages, type ThreadMessage } from "@/lib/useMessages";
import type { ChatConversation } from "@/components/MessagingProvider";
import { conversationLabel } from "./MessagesClient";

// The right pane: header + scrollable transcript + composer. Bubble styling
// mirrors AssistantWidget (own = accent/right, others = surface-2/left). Group &
// project threads show the sender's name above others' bubbles.
export function ThreadPane({
  conversation,
  meId,
  onBack,
}: {
  conversation: ChatConversation;
  meId: string;
  onBack: () => void;
}) {
  const { messages, loading, hasMore, loadingOlder, loadOlder, send, retry, scrollRef } =
    useMessages(conversation.id);
  const [input, setInput] = useState("");
  const { name, avatar, subtitle, group } = conversationLabel(conversation, meId);

  // "Seen" threshold: a message of mine is seen once every OTHER member has read
  // up to (or past) it. We take the *minimum* of the other members' read cursors
  // so a group message reads "Seen" only when everyone has caught up. The cursors
  // come from the conversation row, which the provider re-polls — so this updates
  // live. We render the eye only on the LAST of my seen messages to avoid a
  // column of icons.
  const others = conversation.members.filter((m) => m.id !== meId);
  const seenThreshold =
    others.length > 0
      ? others.reduce(
          (min, m) => (m.lastReadAt < min ? m.lastReadAt : min),
          others[0].lastReadAt,
        )
      : null;
  // The newest of my delivered messages that the other side has read.
  const lastSeenMineId = (() => {
    if (!seenThreshold) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      const delivered =
        m.senderId === meId && m.status !== "sending" && m.status !== "failed";
      if (delivered && m.createdAt <= seenThreshold) return m.id;
    }
    return null;
  })();

  function submit() {
    const text = input;
    setInput("");
    void send(text);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-line px-3 py-2.5 sm:px-4">
        <button
          onClick={onBack}
          aria-label="Back"
          className="hover-surface grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-400 transition hover:text-ink lg:hidden"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        {group ? (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink">
            {conversation.kind === "project" ? (
              <FolderKanban className="h-4 w-4" />
            ) : (
              <Users className="h-4 w-4" />
            )}
          </span>
        ) : (
          <Avatar name={name} src={avatar} size="sm" />
        )}
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-semibold text-ink">
            {name}
          </p>
          {subtitle && (
            <p className="truncate text-[11px] text-ink-400">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Transcript — min-h-0 so this flex child actually scrolls. */}
      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-4 sm:px-4"
      >
        {loading ? (
          <ThreadSkeleton />
        ) : (
          <>
            {hasMore && (
              <button
                onClick={loadOlder}
                disabled={loadingOlder}
                className="mx-auto mb-2 inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[11px] font-medium text-ink-500 transition hover:border-line-strong disabled:opacity-50"
              >
                {loadingOlder && <Loader2 className="h-3 w-3 animate-spin" />}
                Load earlier messages
              </button>
            )}
            {messages.length === 0 ? (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-[13px] text-ink-400">
                  No messages yet — say hello 👋
                </p>
              </div>
            ) : (
              messages.map((m, i) => (
                <Bubble
                  key={m.id}
                  m={m}
                  mine={m.senderId === meId}
                  showSender={group && m.senderId !== meId && isFirstOfRun(messages, i)}
                  seen={m.id === lastSeenMineId}
                  onRetry={() => m.clientId && retry(m.clientId)}
                />
              ))
            )}
          </>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-end gap-2 border-t border-line px-3 py-3"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter inserts a newline.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder="Type a message…"
          className="max-h-32 flex-1 resize-none rounded-xl border border-line bg-surface-2/70 px-3 py-2 text-[13px] text-ink outline-none transition placeholder:text-ink-400 focus:border-line-strong"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          aria-label="Send"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-white transition hover:brightness-110 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

// True when the previous message had a different sender (start of a run) — used
// to show the sender name only once per consecutive run in group threads.
function isFirstOfRun(messages: ThreadMessage[], i: number): boolean {
  if (i === 0) return true;
  return messages[i - 1].senderId !== messages[i].senderId;
}

// Shimmer placeholders shown while a thread's history loads — alternating
// incoming/outgoing bubble shapes so the layout doesn't jump when real messages
// arrive.
function ThreadSkeleton() {
  // Varied widths + sides read like a real conversation at a glance.
  const rows: { mine: boolean; w: string }[] = [
    { mine: false, w: "w-40" },
    { mine: true, w: "w-52" },
    { mine: false, w: "w-32" },
    { mine: false, w: "w-56" },
    { mine: true, w: "w-36" },
    { mine: true, w: "w-44" },
    { mine: false, w: "w-28" },
  ];
  return (
    <div className="flex flex-1 flex-col justify-end gap-2" aria-hidden>
      {rows.map((r, i) => (
        <div
          key={i}
          className={cn("flex", r.mine ? "justify-end" : "justify-start")}
        >
          <Skeleton className={cn("h-9 rounded-2xl", r.w)} />
        </div>
      ))}
    </div>
  );
}

function Bubble({
  m,
  mine,
  showSender,
  seen,
  onRetry,
}: {
  m: ThreadMessage;
  mine: boolean;
  showSender: boolean;
  // True only on my newest message the other side has read — renders the eye.
  seen: boolean;
  onRetry: () => void;
}) {
  return (
    <div className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
      {showSender && (
        <span className="mb-0.5 ml-1 text-[11px] font-medium text-ink-500">
          {m.senderName}
        </span>
      )}
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed",
          mine ? "bg-accent text-white" : "bg-surface-2 text-ink-700",
          m.status === "sending" && "opacity-70",
          m.status === "failed" && "ring-1 ring-danger",
        )}
      >
        {m.body}
      </div>
      {m.status === "failed" ? (
        <button
          onClick={onRetry}
          className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-danger hover:underline"
        >
          <AlertCircle className="h-3 w-3" /> Failed — tap to retry{" "}
          <RotateCw className="h-3 w-3" />
        </button>
      ) : seen ? (
        // Read receipt — the eye appears on my latest message once it's been seen.
        <span className="mr-1 mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-ink-400">
          <Eye className="h-3 w-3" /> Seen
        </span>
      ) : mine && m.status === "sending" ? (
        <span className="mr-1 mt-0.5 inline-flex items-center gap-1 text-[10px] text-ink-400">
          <Check className="h-3 w-3" /> Sending…
        </span>
      ) : null}
    </div>
  );
}

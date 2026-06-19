"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePolling, REALTIME_TRANSPORT } from "@/lib/usePolling";

// ── Messaging provider ────────────────────────────────────────────────────────
// The single source of truth for chat on the client. Mounted in the (app) layout
// so it wraps both the Sidebar (which reads totalUnread for its badge) and the
// /messages page. It:
//   • seeds the conversation list from /api/conversations/list,
//   • opens ONE app-wide EventSource on /api/messages/stream and fans every live
//     message out to (a) the list state, for previews/sort/unread, and (b) any
//     useMessages() thread hook subscribed via subscribe(),
//   • tracks the currently-open conversation (activeId) so a message for the open
//     thread doesn't bump the unread badge.
// Mirrors lib/useNotifications.ts (initial HTTP load + live SSE, `seen` dedupe).

export interface ChatMember {
  id: string;
  name: string;
  title: string;
  avatarUrl: string | null;
  // Read cursor (ISO) — drives "seen" receipts on the sender's messages.
  lastReadAt: string;
}

export interface ChatLastMessage {
  id: string;
  senderId: string | null;
  senderName: string;
  body: string;
  createdAt: string;
}

export interface ChatConversation {
  id: string;
  kind: string;
  title: string | null;
  projectId: string | null;
  lastMessageAt: string;
  members: ChatMember[];
  lastMessage: ChatLastMessage | null;
  unread: number;
}

export interface LiveChatMessage {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderName: string;
  senderAvatar: string | null;
  body: string;
  createdAt: string;
  clientId?: string | null;
}

type MessageHandler = (m: LiveChatMessage) => void;

interface MessagingContextValue {
  me: { id: string; name: string; avatarUrl: string | null };
  conversations: ChatConversation[];
  totalUnread: number;
  /** True until the first conversation-list load resolves (drives the skeleton). */
  loadingConversations: boolean;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  /** Subscribe a thread hook to the live stream. Returns an unsubscribe fn. */
  subscribe: (handler: MessageHandler) => () => void;
  /** Re-fetch the conversation list (after creating a new conversation). */
  refresh: () => Promise<void>;
  /** Locally mark a conversation read (clears its unread immediately). */
  markRead: (conversationId: string) => void;
}

const MessagingContext = createContext<MessagingContextValue | null>(null);

export function useMessaging(): MessagingContextValue {
  const ctx = useContext(MessagingContext);
  if (!ctx)
    throw new Error("useMessaging must be used within <MessagingProvider>");
  return ctx;
}

export function MessagingProvider({
  me,
  children,
}: {
  me: { id: string; name: string; avatarUrl: string | null };
  children: React.ReactNode;
}) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  // True until the first conversation-list load resolves — drives the list
  // skeleton on the /messages page (the page loads its data client-side, so the
  // route-level loading.tsx can't cover it).
  const [loadingConversations, setLoadingConversations] = useState(true);

  // activeId in a ref so the SSE handler (a stable closure) always sees the
  // latest value without re-subscribing the stream.
  const activeRef = useRef<string | null>(null);

  // Thread hooks subscribe here; we fan live messages to all of them.
  const handlers = useRef<Set<MessageHandler>>(new Set());
  const subscribe = useCallback((handler: MessageHandler) => {
    handlers.current.add(handler);
    return () => handlers.current.delete(handler);
  }, []);

  const seen = useRef<Set<string>>(new Set());
  // Poll high-water mark: the ISO timestamp of the newest message we've ingested.
  // Seeded from the initial conversation list so we never replay shown history.
  const cursor = useRef<string | null>(null);

  const markReadLocal = useCallback((conversationId: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c)),
    );
  }, []);

  const setActiveId = useCallback(
    (id: string | null) => {
      activeRef.current = id;
      setActiveIdState(id);
      if (id) markReadLocal(id);
    },
    [markReadLocal],
  );

  // Reconcile the conversation list (previews, ordering, unread, read receipts).
  // IMPORTANT: refresh() must NOT touch the poll cursor. The message-poll owns
  // the cursor and is the only path that delivers messages to OPEN THREADS (via
  // ingestMessage → thread handlers). If refresh() advanced the cursor, it could
  // skip past a just-arrived message before the poll fetched it — the list would
  // update but the open thread would silently miss it until a reload. (That was
  // the "only visible after refresh" bug.)
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations/list");
      if (!res.ok) return;
      const data = await res.json();
      const list: ChatConversation[] = data.conversations ?? [];
      setConversations(list);
    } catch {
      // ignore — reconciles on the next tick
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  // Initial load: fetch the list AND seed the poll cursor ONCE, to the newest
  // message we already have, so the first poll returns only genuinely new
  // messages instead of replaying history. The cursor is never moved again
  // except by the message-poll itself.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/conversations/list");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const list: ChatConversation[] = data.conversations ?? [];
        setConversations(list);
        const newest = list
          .map((c) => c.lastMessage?.createdAt)
          .filter(Boolean)
          .sort()
          .pop() as string | undefined;
        // Seed just BEFORE the newest message (1ms back) so an equal-millisecond
        // message can't be skipped by the strict `>` cursor; `seen` dedupes the
        // re-fetched boundary message.
        if (newest) {
          cursor.current = new Date(
            new Date(newest).getTime() - 1,
          ).toISOString();
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoadingConversations(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Ingest a live message into the conversation list: update preview, bump to
  // top, and increment unread unless it's the open thread or my own message.
  const ingestToList = useCallback(
    (m: LiveChatMessage) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === m.conversationId);
        const isActive = activeRef.current === m.conversationId;
        const isMine = m.senderId === me.id;
        const last: ChatLastMessage = {
          id: m.id,
          senderId: m.senderId,
          senderName: m.senderName,
          body: m.body,
          createdAt: m.createdAt,
        };
        if (idx === -1) {
          // A conversation we don't have yet (e.g. someone just DMed us).
          // Pull the full list so we get members/kind; meanwhile drop a stub.
          void refresh();
          return prev;
        }
        const existing = prev[idx];
        const updated: ChatConversation = {
          ...existing,
          lastMessage: last,
          lastMessageAt: m.createdAt,
          unread:
            isActive || isMine ? existing.unread : existing.unread + 1,
        };
        const rest = prev.filter((_, i) => i !== idx);
        return [updated, ...rest];
      });
    },
    [me.id, refresh],
  );

  // Handle one incoming message regardless of transport: dedupe, update the
  // list, and fan to any open thread hooks (they dedupe too and may need the
  // clientId echo to reconcile an optimistic row).
  const ingestMessage = useCallback(
    (m: LiveChatMessage) => {
      if (seen.current.has(m.id)) {
        handlers.current.forEach((h) => h(m));
        return;
      }
      seen.current.add(m.id);
      ingestToList(m);
      handlers.current.forEach((h) => h(m));
    },
    [ingestToList],
  );

  // ── Transport: polling ─────────────────────────────────────────────────────
  // ALWAYS on. Pull every message newer than our cursor on an interval — this is
  // the universal transport that works on Vercel serverless (where the in-process
  // SSE bus can't reach the receiver). SSE below is purely ADDITIVE; `seen`
  // dedupes if both run, so a stray NEXT_PUBLIC_REALTIME_TRANSPORT value can
  // never disable live updates. Every other tick we also re-pull the conversation
  // list, which carries each member's lastReadAt — that keeps "seen" receipts
  // live for the sender (the recipient reading produces no new message to poll,
  // only an advanced cursor).
  const tick = useRef(0);
  usePolling(async () => {
    try {
      const url = cursor.current
        ? `/api/messages/since?cursor=${encodeURIComponent(cursor.current)}`
        : "/api/messages/since";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const msgs: LiveChatMessage[] = data.messages ?? [];
        msgs.forEach((m) => ingestMessage(m));
        // Advance the cursor to 1ms BEFORE the newest message we just got, so a
        // same-millisecond sibling can never be skipped by the strict `>` filter;
        // `seen` dedupes the boundary message we re-fetch. Only ever move
        // forward. When the batch is empty we leave the cursor put — the next
        // poll simply re-queries from the same point.
        if (msgs.length > 0) {
          const newest = msgs[msgs.length - 1].createdAt;
          const safe = new Date(new Date(newest).getTime() - 1).toISOString();
          if (!cursor.current || safe > cursor.current) cursor.current = safe;
        }
      }
    } catch {
      // next tick retries
    }
    // Reconcile the list (read receipts, membership, ordering) ~every 5s.
    tick.current = (tick.current + 1) % 2;
    if (tick.current === 0) void refresh();
  });

  // ── Transport: SSE (optional, additive — opt in on a long-running host) ─────
  // One EventSource for the whole app. Enabled only when the flag is "sse"; the
  // route still exists for that deployment. Polling above always runs too.
  useEffect(() => {
    if (REALTIME_TRANSPORT !== "sse") return;
    const es = new EventSource("/api/messages/stream");
    es.addEventListener("message", (ev) => {
      try {
        ingestMessage(JSON.parse((ev as MessageEvent).data));
      } catch {
        // ignore malformed frames
      }
    });
    return () => es.close();
  }, [ingestMessage]);

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + c.unread, 0),
    [conversations],
  );

  const value: MessagingContextValue = {
    me,
    conversations,
    totalUnread,
    loadingConversations,
    activeId,
    setActiveId,
    subscribe,
    refresh,
    markRead: markReadLocal,
  };

  return (
    <MessagingContext.Provider value={value}>
      {children}
    </MessagingContext.Provider>
  );
}

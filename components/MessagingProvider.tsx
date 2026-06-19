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

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations/list");
      if (!res.ok) return;
      const data = await res.json();
      const list: ChatConversation[] = data.conversations ?? [];
      list.forEach((c) => c.lastMessage && seen.current.add(c.lastMessage.id));
      setConversations(list);
      // Seed/advance the poll cursor to the newest message we already have, so
      // the first poll only returns genuinely new messages. Only advance it
      // forward (a concurrent refresh shouldn't rewind a cursor the poll moved).
      const newest = list
        .map((c) => c.lastMessage?.createdAt)
        .filter(Boolean)
        .sort()
        .pop() as string | undefined;
      if (newest && (!cursor.current || newest > cursor.current)) {
        cursor.current = newest;
      }
    } catch {
      // ignore — the bell-style reconcile happens on the next load
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  // Initial load.
  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  // ── Transport: polling (serverless-safe, default) ──────────────────────────
  // Pull every message newer than our cursor on an interval. Works across Vercel
  // instances where the in-process SSE bus can't reach the receiver. Every other
  // tick we also re-pull the conversation list, which carries each member's
  // lastReadAt — that's what keeps "seen" receipts live for the sender (the
  // recipient reading produces no new message to poll, only an advanced cursor).
  const tick = useRef(0);
  usePolling(
    async () => {
      try {
        const url = cursor.current
          ? `/api/messages/since?cursor=${encodeURIComponent(cursor.current)}`
          : "/api/messages/since";
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data.cursor) cursor.current = data.cursor;
          (data.messages ?? []).forEach((m: LiveChatMessage) =>
            ingestMessage(m),
          );
        }
      } catch {
        // next tick retries
      }
      // Reconcile the list (read receipts, membership, ordering) ~every 5s.
      tick.current = (tick.current + 1) % 2;
      if (tick.current === 0) void refresh();
    },
    undefined,
    REALTIME_TRANSPORT === "poll",
  );

  // ── Transport: SSE (single long-running host, e.g. DigitalOcean) ───────────
  // One EventSource for the whole app. Enabled only when the transport flag is
  // "sse"; the route still exists for that deployment.
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

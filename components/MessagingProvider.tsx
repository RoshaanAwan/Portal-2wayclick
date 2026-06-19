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
    } catch {
      // ignore — the bell-style reconcile happens on the next load
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

  // Live stream — one EventSource for the whole app.
  useEffect(() => {
    const es = new EventSource("/api/messages/stream");
    es.addEventListener("message", (ev) => {
      try {
        const m: LiveChatMessage = JSON.parse((ev as MessageEvent).data);
        // Dedupe against the initial fetch's last-messages and re-delivery.
        if (seen.current.has(m.id)) {
          // Still fan to thread hooks — they dedupe too and may need the echo
          // (clientId) to reconcile an optimistic row.
          handlers.current.forEach((h) => h(m));
          return;
        }
        seen.current.add(m.id);
        ingestToList(m);
        handlers.current.forEach((h) => h(m));
      } catch {
        // ignore malformed frames
      }
    });
    return () => es.close();
  }, [ingestToList]);

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + c.unread, 0),
    [conversations],
  );

  const value: MessagingContextValue = {
    me,
    conversations,
    totalUnread,
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

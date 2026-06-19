"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useMessaging,
  type LiveChatMessage,
} from "@/components/MessagingProvider";

// Per-thread store for the open conversation. Loads the newest page over HTTP,
// then taps the provider's single live stream (no second EventSource). Handles
// optimistic send (temp row reconciled by clientId → server id), live append
// with dedupe, "load older" prepend, and a debounced mark-read while the thread
// is on screen. Auto-scroll is left to the view via a returned ref.

export interface ThreadMessage {
  id: string; // server id, or a temp "tmp-…" id while sending
  clientId?: string;
  senderId: string | null;
  senderName: string;
  senderAvatar: string | null;
  body: string;
  createdAt: string;
  status?: "sending" | "sent" | "failed";
}

let tmpCounter = 0;
function nextClientId(): string {
  tmpCounter += 1;
  return `c-${tmpCounter}-${performance.now().toString(36)}`;
}

export function useMessages(conversationId: string | null) {
  const { me, subscribe, markRead } = useMessaging();
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const seen = useRef<Set<string>>(new Set());
  const oldestRef = useRef<string | null>(null); // ISO of the oldest loaded msg
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the transcript pinned to the latest message (AssistantWidget pattern).
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }, []);

  // Initial load when the conversation changes.
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    seen.current = new Set();
    oldestRef.current = null;
    setLoading(true);
    fetch(`/api/messages/list?c=${encodeURIComponent(conversationId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const list: ThreadMessage[] = (data.messages ?? []).map(
          (m: any): ThreadMessage => ({ ...m, status: "sent" }),
        );
        list.forEach((m) => seen.current.add(m.id));
        oldestRef.current = data.nextBefore ?? null;
        setHasMore(!!data.hasMore);
        setMessages(list);
        scrollToBottom();
        // We've seen everything up to the newest message → mark read.
        void doMarkRead(conversationId, list);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, scrollToBottom]);

  // Live append — tap the provider's stream, filter to this conversation.
  useEffect(() => {
    if (!conversationId) return;
    const off = subscribe((m: LiveChatMessage) => {
      if (m.conversationId !== conversationId) return;
      setMessages((prev) => {
        // Reconcile my own optimistic row by clientId.
        if (m.clientId) {
          const i = prev.findIndex((x) => x.clientId === m.clientId);
          if (i !== -1) {
            seen.current.add(m.id);
            const copy = prev.slice();
            copy[i] = { ...copy[i], id: m.id, createdAt: m.createdAt, status: "sent" };
            return copy;
          }
        }
        if (seen.current.has(m.id)) return prev;
        seen.current.add(m.id);
        return [
          ...prev,
          {
            id: m.id,
            senderId: m.senderId,
            senderName: m.senderName,
            senderAvatar: m.senderAvatar,
            body: m.body,
            createdAt: m.createdAt,
            status: "sent" as const,
          },
        ];
      });
      scrollToBottom();
      // A new message arrived in the open thread → keep the cursor current.
      void doMarkReadNow(conversationId, m.createdAt);
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, subscribe, scrollToBottom]);

  // ── Mark-read (debounced) ──────────────────────────────────────────────────
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRead = useRef<string | null>(null);

  const doMarkReadNow = useCallback(
    async (cId: string, upTo: string) => {
      if (lastSentRead.current && upTo <= lastSentRead.current) return;
      lastSentRead.current = upTo;
      markRead(cId); // optimistic local clear of the badge
      await fetch("/api/messages/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: cId, upTo }),
      }).catch(() => {});
    },
    [markRead],
  );

  const doMarkRead = useCallback(
    (cId: string, list: ThreadMessage[]) => {
      const newest = list[list.length - 1];
      if (!newest) {
        markRead(cId);
        return;
      }
      if (readTimer.current) clearTimeout(readTimer.current);
      readTimer.current = setTimeout(
        () => void doMarkReadNow(cId, newest.createdAt),
        400,
      );
    },
    [doMarkReadNow, markRead],
  );

  // ── Send (optimistic) ──────────────────────────────────────────────────────
  const send = useCallback(
    async (text: string) => {
      const body = text.trim();
      if (!body || !conversationId) return;
      const clientId = nextClientId();
      const optimistic: ThreadMessage = {
        id: `tmp-${clientId}`,
        clientId,
        senderId: me.id,
        senderName: me.name,
        senderAvatar: me.avatarUrl,
        body,
        createdAt: new Date().toISOString(),
        status: "sending",
      };
      setMessages((prev) => [...prev, optimistic]);
      scrollToBottom();

      try {
        const res = await fetch("/api/messages/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, body, clientId }),
        });
        if (!res.ok) throw new Error("send failed");
        const data = await res.json(); // { id, createdAt }
        // The live echo may have already reconciled by clientId; if not, do it
        // here from the POST response.
        setMessages((prev) => {
          const i = prev.findIndex((x) => x.clientId === clientId);
          if (i === -1) return prev;
          // Already reconciled to a server id by the stream — leave it.
          if (!prev[i].id.startsWith("tmp-")) return prev;
          seen.current.add(data.id);
          const copy = prev.slice();
          copy[i] = { ...copy[i], id: data.id, createdAt: data.createdAt, status: "sent" };
          return copy;
        });
      } catch {
        setMessages((prev) =>
          prev.map((x) =>
            x.clientId === clientId ? { ...x, status: "failed" } : x,
          ),
        );
      }
    },
    [conversationId, me, scrollToBottom],
  );

  const retry = useCallback(
    (clientId: string) => {
      const msg = messages.find((m) => m.clientId === clientId);
      if (!msg) return;
      setMessages((prev) => prev.filter((m) => m.clientId !== clientId));
      void send(msg.body);
    },
    [messages, send],
  );

  // ── Load older (prepend, preserve scroll) ──────────────────────────────────
  const loadOlder = useCallback(async () => {
    if (!conversationId || !hasMore || loadingOlder || !oldestRef.current) return;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const res = await fetch(
        `/api/messages/list?c=${encodeURIComponent(conversationId)}&before=${encodeURIComponent(oldestRef.current)}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      const older: ThreadMessage[] = (data.messages ?? [])
        .filter((m: any) => !seen.current.has(m.id))
        .map((m: any): ThreadMessage => ({ ...m, status: "sent" }));
      older.forEach((m) => seen.current.add(m.id));
      oldestRef.current = data.nextBefore ?? oldestRef.current;
      setHasMore(!!data.hasMore);
      setMessages((prev) => [...older, ...prev]);
      // Preserve the viewport position after prepending.
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    } catch {
      // ignore
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, hasMore, loadingOlder]);

  return {
    messages,
    loading,
    hasMore,
    loadingOlder,
    loadOlder,
    send,
    retry,
    scrollRef,
  };
}

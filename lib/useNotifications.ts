"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Client-side notification store for the topbar bell. Loads the initial list
// over HTTP, then opens an SSE stream so new notifications arrive live. Exposes
// the list, the unread count, and actions to persist read state.

export interface ClientNotification {
  id: string;
  type: string;
  message: string;
  link: string | null;
  actorName: string | null;
  actorAvatar: string | null;
  createdAt: string;
  readAt: string | null;
}

export function useNotifications() {
  const [items, setItems] = useState<ClientNotification[]>([]);
  const [unread, setUnread] = useState(0);
  // Guards the optimistic merge in the SSE handler against duplicate ids (e.g.
  // an event that races the initial fetch).
  const seen = useRef<Set<string>>(new Set());

  const ingest = useCallback((n: ClientNotification, atTop = true) => {
    if (seen.current.has(n.id)) return;
    seen.current.add(n.id);
    setItems((prev) => (atTop ? [n, ...prev] : [...prev, n]).slice(0, 30));
    if (!n.readAt) setUnread((c) => c + 1);
  }, []);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/notifications/list")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const list: ClientNotification[] = data.notifications ?? [];
        list.forEach((n) => seen.current.add(n.id));
        setItems(list);
        setUnread(data.unread ?? 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Live stream.
  useEffect(() => {
    const es = new EventSource("/api/notifications/stream");
    es.addEventListener("notification", (ev) => {
      try {
        ingest(JSON.parse((ev as MessageEvent).data));
      } catch {
        // ignore malformed frames
      }
    });
    // On error EventSource auto-reconnects; nothing to do but let it.
    return () => es.close();
  }, [ingest]);

  const markAllRead = useCallback(async () => {
    // Optimistic: clear the badge immediately, then persist.
    setUnread(0);
    setItems((prev) =>
      prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })),
    );
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => {});
  }, []);

  return { items, unread, markAllRead };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePolling, REALTIME_TRANSPORT } from "@/lib/usePolling";

// Client-side notification store for the topbar bell. Loads the initial list
// over HTTP, then keeps it live. Default transport is polling (serverless-safe);
// set NEXT_PUBLIC_REALTIME_TRANSPORT="sse" on a single long-running host to use
// the SSE stream instead. Exposes the list, the unread count, and read actions.

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
  // Guards the optimistic merge against duplicate ids (e.g. a poll batch that
  // races the initial fetch).
  const seen = useRef<Set<string>>(new Set());
  // Poll high-water mark: ISO timestamp of the newest notification we've seen.
  const cursor = useRef<string | null>(null);

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
        // Seed the cursor to the newest notification (list is newest-first).
        if (list[0]?.createdAt) cursor.current = list[0].createdAt;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Transport: polling ─────────────────────────────────────────────────────
  // ALWAYS on. Polling is the universal transport that works on Vercel
  // serverless (where the in-process SSE bus can't reach the recipient). SSE
  // below is purely ADDITIVE — when it works (single long-running host) it just
  // delivers faster; `seen` dedupes so running both is safe. We never disable
  // polling, so a stray NEXT_PUBLIC_REALTIME_TRANSPORT value can't break live
  // updates in production.
  usePolling(async () => {
    try {
      const url = cursor.current
        ? `/api/notifications/since?cursor=${encodeURIComponent(cursor.current)}`
        : "/api/notifications/since";
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      if (data.cursor) cursor.current = data.cursor;
      // Server returns oldest-first; ingest in order so the newest ends on top.
      (data.notifications ?? []).forEach((n: ClientNotification) => ingest(n));
      // Trust the server's authoritative unread count (read-state may have
      // changed elsewhere, e.g. another tab).
      if (typeof data.unread === "number") setUnread(data.unread);
    } catch {
      // next tick retries
    }
  });

  // ── Transport: SSE (optional, additive — opt in on a long-running host) ─────
  useEffect(() => {
    if (REALTIME_TRANSPORT !== "sse") return;
    const es = new EventSource("/api/notifications/stream");
    es.addEventListener("notification", (ev) => {
      try {
        ingest(JSON.parse((ev as MessageEvent).data));
      } catch {
        // ignore malformed frames
      }
    });
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

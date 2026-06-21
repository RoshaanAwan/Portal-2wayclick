"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePolling } from "@/lib/usePolling";

// Client-side notification store for the topbar bell. Loads the initial list
// over HTTP, then keeps it live via two cooperating transports: a Web Push nudge
// from the service worker triggers an instant pull the moment a notification
// fires (no held connection), and adaptive polling runs underneath as a slow
// always-on fallback. Exposes the list, the unread count, and read actions.

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
  // Counts polls so we can ask the server to recompute the unread count only
  // periodically (~every 30s at a 2.5s cadence) instead of on every tick. The
  // server otherwise omits the count when nothing changed; this reconcile catches
  // read-state changes made in another tab/device.
  const pollTick = useRef(0);
  const RECONCILE_EVERY = 12;

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

  // One pull of everything newer than the cursor. Returns `true` when at least
  // one new notification arrived. Shared by the poll loop AND the push-triggered
  // sync below so both go through identical fetch/ingest/dedupe logic — `seen`
  // makes calling it from multiple sources at once safe (no duplicate items).
  const sync = useCallback(async () => {
    try {
      // Ask for an unread-count reconcile every Nth poll; otherwise the server
      // returns the count only when new rows arrived.
      pollTick.current = (pollTick.current + 1) % RECONCILE_EVERY;
      const reconcile = pollTick.current === 0;
      const params = new URLSearchParams();
      if (cursor.current) params.set("cursor", cursor.current);
      if (reconcile) params.set("reconcile", "1");
      const qs = params.toString();
      const url = qs
        ? `/api/notifications/since?${qs}`
        : "/api/notifications/since";
      const res = await fetch(url);
      if (!res.ok) return false;
      const data = await res.json();
      if (data.cursor) cursor.current = data.cursor;
      // Server returns oldest-first; ingest in order so the newest ends on top.
      const fresh: ClientNotification[] = data.notifications ?? [];
      fresh.forEach((n) => ingest(n));
      // Trust the server's authoritative unread count (read-state may have
      // changed elsewhere, e.g. another tab).
      if (typeof data.unread === "number") setUnread(data.unread);
      return fresh.length > 0;
    } catch {
      return false;
    }
  }, [ingest]);

  // ── Transport: adaptive polling (always-on fallback) ────────────────────────
  // The universal transport that works everywhere. With the push-triggered sync
  // below carrying live updates, this is now mostly a SAFETY NET — it ramps down
  // to a slow cadence (see POLL_INTERVAL_MAX_MS) and catches anything the push
  // path misses (user hasn't enabled push, push service hiccup, no HTTPS in dev).
  // A bare reconcile (no new rows) must NOT keep the loop hot, so it returns the
  // "got new data" signal straight from sync().
  usePolling(sync);

  // ── Transport: push-triggered sync (instant, no held connection) ────────────
  // The service worker postMessages "notif-sync" the moment a Web Push for this
  // user lands (see public/sw.js). We pull once, right then — so the bell updates
  // near-instantly without SSE/WebSocket and without fast polling. Requires the
  // user to have enabled push; everyone else falls back to the poll loop above.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
    const onMessage = (ev: MessageEvent) => {
      if (ev.data?.type === "notif-sync") void sync();
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [sync]);

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

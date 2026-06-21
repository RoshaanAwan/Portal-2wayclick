"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedItem } from "@/app/(app)/dashboard/PulseFeed";
import { usePolling } from "@/lib/usePolling";

// Client store for the Live Activity Wall. Seeds from the server-rendered feed,
// then keeps it live via a Web Push nudge (the service worker postMessages on
// each push, triggering an instant pull) with adaptive polling underneath as a
// slow always-on fallback. Company-wide and read-only — it's a feed, not an inbox.

export function useActivityStream(initial: FeedItem[], cap = 12) {
  const [items, setItems] = useState<FeedItem[]>(initial);
  // How many entries arrived live since mount — drives the "+N new" pulse.
  const [liveCount, setLiveCount] = useState(0);
  // Guard against duplicate ids (e.g. a poll batch that races a fast first paint).
  const seen = useRef<Set<string>>(new Set(initial.map((i) => i.id)));
  // Poll high-water mark: newest activity timestamp (initial is newest-first).
  const cursor = useRef<string | null>(initial[0]?.createdAt ?? null);

  const ingest = useCallback(
    (item: FeedItem) => {
      if (seen.current.has(item.id)) return;
      seen.current.add(item.id);
      setItems((prev) => [item, ...prev].slice(0, cap));
      setLiveCount((c) => c + 1);
    },
    [cap],
  );

  // One pull of everything newer than the cursor. Returns `true` when new
  // activity arrived. Shared by the poll loop AND the push-triggered sync below
  // so both go through identical fetch/ingest logic; `seen` dedupes so calling
  // it from both at once can't double-insert.
  const sync = useCallback(async () => {
    try {
      const url = cursor.current
        ? `/api/activity/since?cursor=${encodeURIComponent(cursor.current)}`
        : "/api/activity/since";
      const res = await fetch(url);
      if (!res.ok) return false;
      const data = await res.json();
      if (data.cursor) cursor.current = data.cursor;
      // Server returns oldest-first; ingest in order so newest ends on top.
      const fresh: FeedItem[] = data.activities ?? [];
      fresh.forEach((a) => ingest(a));
      return fresh.length > 0;
    } catch {
      return false;
    }
  }, [ingest]);

  // ── Transport: adaptive polling (always-on fallback) ────────────────────────
  // Ramps down to a slow cadence (see usePolling); the push-triggered sync below
  // carries the live updates, so this just catches anything push misses.
  usePolling(sync);

  // ── Transport: push-triggered sync (instant, no held connection) ────────────
  // The service worker postMessages "notif-sync" the moment a Web Push lands; we
  // pull once right then so the wall animates in new activity near-instantly
  // without SSE/WebSocket. Falls back to the poll loop above when push is off.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
    const onMessage = (ev: MessageEvent) => {
      if (ev.data?.type === "notif-sync") void sync();
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [sync]);

  return { items, liveCount };
}

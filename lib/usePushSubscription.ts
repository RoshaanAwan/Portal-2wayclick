"use client";

import { useCallback, useEffect, useState } from "react";

// ── Client-side Web Push subscription management ──────────────────────────────
// Drives the Settings toggle: reports whether push is supported/enabled in this
// browser, and enable()/disable() that wire up (or tear down) the browser
// PushSubscription and sync it with the server.

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type PushStatus =
  | "loading" // figuring out current state
  | "unsupported" // browser/SW/keys missing
  | "denied" // OS/browser permission blocked
  | "disabled" // supported but not subscribed here
  | "enabled"; // subscribed in this browser

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  // Back it with a concrete ArrayBuffer so the type satisfies
  // PushManager.subscribe's BufferSource (not a SharedArrayBuffer-backed view).
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    !!VAPID_PUBLIC_KEY
  );
}

// The SW only auto-registers in production (see ServiceWorkerRegister), so make
// sure one is registered before we try to subscribe — works in dev too.
async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) {
    await navigator.serviceWorker.ready;
    return existing;
  }
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

export function usePushSubscription() {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine the current state on mount.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!pushSupported()) {
        if (active) setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (active) setStatus("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration("/");
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (active) setStatus(sub ? "enabled" : "disabled");
      } catch {
        if (active) setStatus("disabled");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "disabled");
        return false;
      }

      const reg = await getRegistration();
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));

      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint, keys: json.keys }),
      });
      if (!res.ok) throw new Error("Could not save subscription");

      setStatus("enabled");
      // Fire a confirmation push so the user sees it working right away.
      fetch("/api/push/test", { method: "POST" }).catch(() => {});
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enable push");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setStatus("disabled");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disable push");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, busy, error, enable, disable };
}

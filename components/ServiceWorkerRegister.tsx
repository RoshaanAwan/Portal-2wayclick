"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker (public/sw.js) once the page has loaded.
 *
 * Registration is deferred to the `load` event so it never competes with the
 * app's initial render/hydration for bandwidth. In development we proactively
 * unregister instead — a stale SW caching dev bundles is a common source of
 * "why isn't my change showing" confusion, and offline support only matters in
 * production anyway.
 *
 * Renders nothing.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // In dev, make sure no previously-registered SW is intercepting requests.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
      return;
    }

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          // When a new SW is found and finishes installing while an old one is
          // already controlling the page, activate it immediately so users get
          // fresh assets on the next navigation rather than a stale shell.
          reg.addEventListener("updatefound", () => {
            const installing = reg.installing;
            if (!installing) return;
            installing.addEventListener("statechange", () => {
              if (
                installing.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                installing.postMessage?.("SKIP_WAITING");
              }
            });
          });
        })
        .catch(() => {
          /* registration failure is non-fatal — the app still works online */
        });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}

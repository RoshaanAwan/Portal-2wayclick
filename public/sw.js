/* 2WayClick service worker — installable PWA + offline shell.
 *
 * Deliberately conservative for an auth-gated, data-heavy portal:
 *  - Navigations are network-first; on failure we show a generic offline page.
 *    We never cache authenticated HTML (it's user-specific and could leak
 *    between sessions/users), so the offline fallback is a static shell only.
 *  - Static, content-hashed assets (/_next/static, icons, images) are
 *    cache-first — they're immutable, so serving from cache is safe and fast.
 *  - API requests are never touched: always hit the network (mutable + scoped).
 *  - Only same-origin GET requests are handled; everything else passes through.
 *
 * Bump CACHE_VERSION to invalidate the precache on the next deploy.
 */

const CACHE_VERSION = "v3";
const PRECACHE = `2wc-precache-${CACHE_VERSION}`;
const RUNTIME = `2wc-runtime-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";

// Assets safe to precache: the offline page and brand/icon files. These exist
// at build time and aren't user-specific.
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/logo.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      // addAll is atomic-ish; if one fails the install fails. Add individually
      // so a single missing asset doesn't block installation.
      await Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {}),
        ),
      );
      // Take over without waiting for old tabs to close.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from previous versions.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== PRECACHE && k !== RUNTIME)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// Allow the page to trigger an immediate activation after an update.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/logo.png" ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/favicon.ico" ||
    /\.(?:js|css|woff2?|ttf|otf|png|jpg|jpeg|gif|svg|webp|avif|ico)$/.test(
      url.pathname,
    )
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle same-origin GET. Let the browser do everything else (POSTs,
  // cross-origin avatars/images, SSE streams, etc.).
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept API or auth or SSE endpoints — always live network.
  if (url.pathname.startsWith("/api/")) return;

  // Page navigations: network-first, fall back to the offline shell.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          return fresh;
        } catch {
          const cache = await caches.open(PRECACHE);
          const offline = await cache.match(OFFLINE_URL);
          return (
            offline ||
            new Response("You are offline.", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            })
          );
        }
      })(),
    );
    return;
  }

  // Static, content-hashed assets: cache-first, then populate the runtime cache.
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const fresh = await fetch(request);
          if (fresh && fresh.status === 200 && fresh.type === "basic") {
            const cache = await caches.open(RUNTIME);
            cache.put(request, fresh.clone());
          }
          return fresh;
        } catch {
          // No cache and no network — let it fail naturally.
          return Response.error();
        }
      })(),
    );
  }
});

// ── Web Push ─────────────────────────────────────────────────────────────────
// Show an OS notification from the push payload sent by lib/push.ts.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Fall back to plain text if the payload isn't JSON.
    data = { title: "2WayClick", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "2WayClick";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    // Collapse same-kind notifications so a burst doesn't pile up.
    tag: data.tag || undefined,
    // Stash the deep link for the click handler.
    data: { url: data.url || "/dashboard" },
  };

  // Deliver the OS notification AND nudge any open app tabs to pull the new
  // data immediately. The nudge lets the in-app bell/feed update live without a
  // held connection (no SSE/WebSocket) and without fast polling — open tabs do a
  // single cursor-deduped /since fetch only when a real event actually fired.
  // Best-effort: a client that ignores the message just relies on slow polling.
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      try {
        const clientsList = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        for (const client of clientsList) {
          client.postMessage({ type: "notif-sync", tag: data.tag || null });
        }
      } catch {
        // matchAll/postMessage can throw if the SW is shutting down — ignore.
      }
    })(),
  );
});

// Focus an existing app tab (navigating it to the link) or open a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/dashboard";
  const targetUrl = new URL(target, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clientsList) {
        // Reuse an already-open same-origin tab if there is one.
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(targetUrl);
            } catch {
              /* navigate can reject cross-document — focusing is enough */
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
    })(),
  );
});

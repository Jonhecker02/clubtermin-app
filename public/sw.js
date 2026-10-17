// ---------------------------------------------------------------------------
// Offline support
//   * Static build files (hashed, immutable) and icons: cache-first.
//   * Page navigations: network-first, so you always get the fresh version
//     when online; the last copy of a page you visited is the fallback when
//     you're not, and /offline.html when there is none. Pages are client
//     rendered shells — the actual data comes from the app's own cache.
//   * API calls and Supabase are never touched.
// ---------------------------------------------------------------------------
const STATIC_CACHE = "ct-static-v1";
const PAGE_CACHE = "ct-pages-v1";
const OFFLINE_URL = "/offline.html";
// No caching on a dev machine: it would freeze Next's hot-reload chunks.
const CACHING_ENABLED = self.location.hostname !== "localhost" && self.location.hostname !== "127.0.0.1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  if (!CACHING_ENABLED) return;
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll([OFFLINE_URL])));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = [STATIC_CACHE, PAGE_CACHE];
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("ct-") && !keep.includes(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/splash/");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (!CACHING_ENABLED || request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          // Only keep real pages — not the redirect to /login of a signed-out
          // visitor, and not error responses.
          if (response.ok && !response.redirected) {
            const cache = await caches.open(PAGE_CACHE);
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          const cached = await caches.match(request, { cacheName: PAGE_CACHE });
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL, { cacheName: STATIC_CACHE });
          return offline || Response.error();
        }
      })(),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "ClubTermine", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "ClubTermine";
  const options = {
    body: data.body || "",
    // PNG on purpose: SVG icons aren't rendered in notifications on most platforms.
    icon: "/icons/icon-192.png",
    // Android shows this white-on-transparent glyph in the status bar.
    badge: "/icons/badge-96.png",
    data: { url: data.url || "/" },
  };
  // Same tag = replaces the previous notification for that termin instead of stacking.
  if (data.tag) {
    options.tag = data.tag;
    options.renotify = true;
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    event.notification.data && event.notification.data.url ? event.notification.data.url : "/",
    self.location.origin,
  ).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // An already-open app window: bring it forward and send it to the right page.
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          return client.focus().then((focused) => (focused && "navigate" in focused ? focused.navigate(target) : focused));
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    }),
  );
});

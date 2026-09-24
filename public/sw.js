/* Grow|Observer — Service Worker
 * Strategien:
 *  - Navigation: network-first mit Offline-Shell-Fallback
 *  - Bilder (inkl. remote Pexels): stale-while-revalidate
 *  - Sonstiges: cache-first mit Network-Fallback
 */
const CACHE = "go-shell-v2";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Background Sync: re-warm the shell cache once connectivity returns
self.addEventListener("sync", (event) => {
  if (event.tag === "go-sync") {
    event.waitUntil(
      caches.open(CACHE).then((cache) =>
        Promise.all(SHELL.map((url) => fetch(url).then((res) => cache.put(url, res)).catch(() => {})))
      )
    );
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Navigation: network-first, offline shell fallback
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/index.html")));
    return;
  }

  // Images (incl. remote Pexels): stale-while-revalidate
  if (req.destination === "image") {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Default: cache-first with network fallback
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            return res;
          })
          .catch(() => caches.match("/index.html"))
    )
  );
});

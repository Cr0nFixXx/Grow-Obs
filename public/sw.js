/* Static shell only. APIs, external media and signed/private URLs are network-only. */
importScripts("/sw-policy.js");
const CACHE = "go-shell-v3-public-only";
const policy = self.GrowCachePolicy;
const origin = self.location.origin;

async function fetchAndStore(request) {
  const response = await fetch(request);
  if (policy.canStore(request, response, origin)) {
    const cache = await caches.open(CACHE);
    try { await cache.put(request, response.clone()); } catch { /* Storage quota: still serve network. */ }
  }
  return response;
}

async function warmShell() {
  await Promise.all(policy.shellPaths.map(async (path) => {
    try { await fetchAndStore(new Request(new URL(path, origin), { cache: "reload", credentials: "omit" })); }
    catch { /* Optional offline shell asset not available yet. */ }
  }));
}

async function removeLegacyCaches() {
  const names = await caches.keys();
  await Promise.all(names.filter((name) => name.startsWith("go-") && name !== CACHE).map((name) => caches.delete(name)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(warmShell().then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  // Previous versions could cache authenticated responses. Remove those caches on upgrade.
  event.waitUntil(removeLegacyCaches().then(() => self.clients.claim()));
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_PRIVATE_CACHES") {
    event.waitUntil(removeLegacyCaches().then(() => event.ports[0]?.postMessage({ ok: true })));
  }
});
self.addEventListener("sync", (event) => {
  if (event.tag === "go-sync") event.waitUntil(warmShell());
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const strategy = policy.classify(request, origin);
  if (strategy === "network") return;
  if (strategy === "navigation") {
    event.respondWith(fetchAndStore(request).catch(async () => {
      const cache = await caches.open(CACHE);
      return await cache.match("/index.html") || new Response("Grow|Observer ist offline. Bitte einmal online oeffnen.", {
        status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }));
    return;
  }
  // Keep background writes alive; do not return HTML as an image/JSON error fallback.
  const network = fetchAndStore(request);
  event.waitUntil(network.then(() => undefined).catch(() => undefined));
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    return cached || await network.catch(() => Response.error());
  })());
});

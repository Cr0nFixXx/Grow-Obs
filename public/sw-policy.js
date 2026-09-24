/* Shared by the classic service worker and its Node regression tests. */
(() => {
  const shellPaths = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png", "/sw-policy.js"];
  const assetPaths = new Set([...shellPaths, "/images/hero.jpg", "/images/og.jpg"]);
  const classify = (request, origin) => {
    const url = new URL(request.url);
    if (request.method !== "GET" || request.headers.has("authorization") || request.cache === "no-store") return "network";
    if (url.origin !== origin || url.search || !assetPaths.has(url.pathname)) return "network";
    if (request.mode === "navigate") return ["/", "/index.html"].includes(url.pathname) ? "navigation" : "network";
    return "asset";
  };
  const canStore = (request, response, origin) => {
    if (classify(request, origin) === "network" || response.status !== 200 || response.redirected) return false;
    if (/private|no-store/i.test(response.headers.get("cache-control") || "")) return false;
    if (/(^|,)\s*(\*|authorization|cookie)\s*(,|$)/i.test(response.headers.get("vary") || "")) return false;
    const path = new URL(request.url).pathname;
    const mime = response.headers.get("content-type") || "";
    // Never cache an SPA fallback response as an icon or manifest.
    if (["/", "/index.html"].includes(path)) return /text\/html/i.test(mime);
    if (path.endsWith(".webmanifest")) return /application\/(manifest\+json|json)/i.test(mime);
    if (path.endsWith(".js")) return /javascript/i.test(mime);
    return /^image\//i.test(mime);
  };
  globalThis.GrowCachePolicy = Object.freeze({ shellPaths, classify, canStore });
})();
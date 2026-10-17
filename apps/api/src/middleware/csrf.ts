import { createMiddleware } from "hono/factory";
import { corsOrigins } from "../env.ts";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF-Schutz für das Cookie-Login (ergänzt SameSite=Lax). Zustandsändernde Requests aus dem Browser
 * müssen same-origin sein oder von einem erlaubten Origin (`CORS_ORIGINS`) kommen.
 * Nicht-Browser-Clients (ohne `Sec-Fetch-Site`/`Origin`) sind davon nicht betroffen.
 */
export const csrfGuard = createMiddleware(async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) return next();
  const origin = c.req.header("origin");
  const site = c.req.header("sec-fetch-site");
  const allowedOrigin = !!origin && corsOrigins.includes(origin);
  if (site) {
    if (site === "same-origin" || site === "none" || allowedOrigin) return next();
    return c.json({ error: "Ungültige Herkunft der Anfrage" }, 403);
  }
  if (origin) {
    const host = c.req.header("x-forwarded-host")?.split(",")[0]?.trim() ?? c.req.header("host");
    let originHost: string | null = null;
    try { originHost = new URL(origin).host; } catch { /* ungültiger Origin → ablehnen */ }
    if (allowedOrigin || (originHost !== null && originHost === host)) return next();
    return c.json({ error: "Ungültige Herkunft der Anfrage" }, 403);
  }
  return next();
});

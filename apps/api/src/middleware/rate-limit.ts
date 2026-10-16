import type { Context, MiddlewareHandler } from "hono";

/**
 * Einfacher In-Memory-Rate-Limiter (Fixed Window) pro Prozess.
 * Schutz gegen Brute-Force (Login), Massen-Registrierung und Upload-Flut. Bei mehreren
 * Instanzen zählt jede Instanz getrennt – dann zusätzlich am Reverse-Proxy limitieren.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000;

export type RateLimitOptions = {
  /** Eindeutiger Name des Limits (Namespace im Zähler). */
  name: string;
  /** Erlaubte Requests pro Fenster. */
  limit: number;
  /** Fensterlänge in Millisekunden. */
  windowMs: number;
  /** Zusätzliche Schlüssel (z. B. E-Mail-Hash); Standard: nur Client-IP. */
  keys?: (c: Context) => Promise<string[]> | string[];
};

/** Löscht abgelaufene Einträge; bei Überlauf zusätzlich die ältesten (Speicherschutz). */
function sweep(now: number) {
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  if (buckets.size > MAX_KEYS) {
    const overflow = buckets.size - MAX_KEYS;
    let removed = 0;
    for (const key of buckets.keys()) { buckets.delete(key); if (++removed >= overflow) break; }
  }
}

/** Zählt einen Treffer; liefert `retryAfter` (Sekunden), wenn das Limit überschritten ist. */
export function hit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: true } | { ok: false; retryAfter: number } {
  if (buckets.size >= MAX_KEYS) sweep(now);
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > limit) return { ok: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  return { ok: true };
}

/** Nur für Tests: setzt alle Zähler zurück. */
export function resetRateLimits() { buckets.clear(); }

/**
 * Client-IP. Hinter einem vertrauenswürdigen Proxy (Standard) zählt der **letzte** `X-Forwarded-For`-Eintrag
 * (vom nächsten Proxy angehängt, nicht vom Client fälschbar). Ohne Proxy `TRUST_PROXY=false` setzen.
 */
export function clientIp(c: Context): string {
  if (process.env.TRUST_PROXY !== "false") {
    const forwarded = c.req.header("x-forwarded-for")?.split(",").map((part) => part.trim()).filter(Boolean).pop();
    if (forwarded) return forwarded.slice(0, 64);
    const real = c.req.header("x-real-ip")?.trim();
    if (real) return real.slice(0, 64);
  }
  return "unknown";
}

function disabled() { return process.env.RATE_LIMIT_DISABLED === "true"; }

export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
  return async (c, next) => {
    if (disabled()) return next();
    const extra = options.keys ? await options.keys(c) : [];
    const keys = [`${options.name}:ip:${clientIp(c)}`, ...extra.map((key) => `${options.name}:${key}`)];
    for (const key of keys) {
      const result = hit(key, options.limit, options.windowMs);
      if (!result.ok) {
        c.header("Retry-After", String(result.retryAfter));
        return c.json({ error: "Zu viele Anfragen – bitte später erneut versuchen", retryAfter: result.retryAfter }, 429);
      }
    }
    return next();
  };
}

/** Liest die E-Mail aus dem JSON-Body (Klon, damit der Handler den Body noch lesen kann). */
export async function emailKey(c: Context): Promise<string[]> {
  const body = await c.req.raw.clone().json().catch(() => null) as { email?: unknown } | null;
  return typeof body?.email === "string" && body.email.length <= 254 ? [`email:${body.email.trim().toLowerCase()}`] : [];
}

/** Pro angemeldetem Nutzer (nach `requireAuth` einsetzen). */
export function userKey(c: Context): string[] {
  const id = c.get("userId" as never) as string | undefined;
  return id ? [`user:${id}`] : [];
}

import { createHash } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import { sql } from "drizzle-orm";
import { db } from "../db/client.ts";

/**
 * Rate-Limiter (Fixed Window) gegen Brute-Force (Login), Massen-Registrierung und Flut.
 *
 * **Zähler liegen in PostgreSQL** (Tabelle `rate_limits`, B-60) und gelten damit für alle API-Instanzen gemeinsam:
 * ein atomarer Upsert je Anfrage (ein Roundtrip für alle Schlüssel), Fenster nach Datenbankzeit. Schlüssel werden
 * gehasht gespeichert (keine Klartext-E-Mail/IP). Ist die Datenbank nicht erreichbar (oder die Tabelle fehlt),
 * zählt der Prozess **ersatzweise im Speicher** (fail-open mit lokalem Limit) und meldet das einmal pro Minute im Log.
 * Der Speicher-Zähler (`hit`) bleibt als Fallback und für Unit-Tests erhalten.
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

/** Nur für Tests: setzt alle Zähler zurück (Speicher und gemeinsame Tabelle). */
export async function resetRateLimits(): Promise<void> {
  buckets.clear();
  try { await db.execute(sql`DELETE FROM rate_limits`); } catch { /* Tabelle fehlt (noch nicht migriert) – nichts zu tun */ }
}

const keyHash = (key: string) => createHash("sha256").update(`go-rl:${key}`).digest("hex");

export type ConsumeResult = { ok: true } | { ok: false; retryAfter: number };

let lastWarn = 0;
let lastSweep = 0;
const SWEEP_EVERY_MS = 60_000;

/** Entfernt abgelaufene Zähler – höchstens einmal pro Minute und Prozess, ohne die Anfrage zu verzögern. */
function sweepStore() {
  const now = Date.now();
  if (now - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = now;
  void db.execute(sql`DELETE FROM rate_limits WHERE reset_at < now() - interval '1 minute'`).catch(() => undefined);
}

/**
 * Zählt je Schlüssel einen Treffer in der gemeinsamen Tabelle und liefert das Ergebnis über alle Schlüssel.
 * Alle Schlüssel werden gezählt (auch bei Überschreitung eines anderen) – so läuft ein Angreifer nicht „kostenlos“ weiter.
 */
export async function consume(keys: string[], limit: number, windowMs: number): Promise<ConsumeResult> {
  const unique = [...new Set(keys)];
  if (unique.length === 0) return { ok: true };
  try {
    const interval = `${Math.max(1, Math.floor(windowMs))} milliseconds`;
    const values = sql.join(unique.map((key) => sql`(${keyHash(key)}, 1, now() + ${interval}::interval)`), sql`, `);
    const rows = await db.execute<{ count: number; wait: number }>(sql`
      INSERT INTO rate_limits AS r (key, count, reset_at) VALUES ${values}
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN r.reset_at <= now() THEN 1 ELSE r.count + 1 END,
        reset_at = CASE WHEN r.reset_at <= now() THEN now() + ${interval}::interval ELSE r.reset_at END
      RETURNING r.count, EXTRACT(EPOCH FROM (r.reset_at - now()))::float8 AS wait`);
    sweepStore();
    let retryAfter = 0;
    for (const row of rows) if (Number(row.count) > limit) retryAfter = Math.max(retryAfter, Math.max(1, Math.ceil(Number(row.wait))));
    return retryAfter ? { ok: false, retryAfter } : { ok: true };
  } catch (error) {
    const now = Date.now();
    if (now - lastWarn > 60_000) {
      lastWarn = now;
      console.warn("[rate-limit] gemeinsamer Zähler nicht verfügbar – Prozess-Zähler als Ersatz:", error instanceof Error ? error.message : error);
    }
    for (const key of unique) {
      const result = hit(key, limit, windowMs);
      if (!result.ok) return result;
    }
    return { ok: true };
  }
}

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
    const result = await consume(keys, options.limit, options.windowMs);
    if (!result.ok) {
      c.header("Retry-After", String(result.retryAfter));
      return c.json({ error: "Zu viele Anfragen – bitte später erneut versuchen", retryAfter: result.retryAfter }, 429);
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

import { and, eq, gt, lt } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { db } from "../db/client.ts";
import { sessions, users } from "../db/schema.ts";
import { env } from "../env.ts";
import { signToken, verifyToken } from "./jwt.ts";

/** HttpOnly-Cookie mit dem Sitzungs-JWT. Für JavaScript im Browser nicht lesbar (XSS-Schutz). */
export const SESSION_COOKIE = "go_session";

const UNITS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;
/** "30d" → Millisekunden. Das Format ist durch die Umgebungsvalidierung bereits gesichert. */
export function parseDuration(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) throw new Error(`Invalid duration: ${value}`);
  return Number(match[1]) * UNITS[match[2] as keyof typeof UNITS];
}

/** Maximale Lebensdauer einer „Angemeldet bleiben“-Sitzung (JWT_TTL) bzw. einer Tab-/Browser-Sitzung. */
export const sessionMaxMs = () => parseDuration(env.JWT_TTL);
export const sessionShortMs = () => Math.min(sessionMaxMs(), 12 * UNITS.h);
/** `last_seen_at` wird höchstens alle 5 Minuten geschrieben. */
const TOUCH_INTERVAL_MS = 5 * UNITS.m;

function isHttps(c: Context): boolean {
  if (c.req.header("x-forwarded-proto")?.split(",")[0]?.trim() === "https") return true;
  try { return new URL(c.req.url).protocol === "https:"; } catch { return false; }
}

/** Grobe, lesbare Gerätebezeichnung („Chrome auf Windows“) – der rohe User-Agent verlässt den Server nicht. */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  if (!ua) return "Unbekanntes Gerät";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\/|CriOS\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux|X11/.test(ua) ? "Linux" : null;
  return os ? `${browser} auf ${os}` : browser;
}

/** Legt eine Sitzung an, setzt das Cookie und räumt abgelaufene Sitzungen auf. */
export async function startSession(c: Context, user: { id: string; role: typeof users.$inferSelect.role }, remember: boolean): Promise<void> {
  const ttl = remember ? sessionMaxMs() : sessionShortMs();
  const expiresAt = new Date(Date.now() + ttl);
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  const [row] = await db.insert(sessions).values({
    userId: user.id, expiresAt, userAgent: (c.req.header("user-agent") ?? "").slice(0, 300) || null,
  }).returning({ id: sessions.id });
  const token = await signToken({ sub: user.id, role: user.role, sid: row!.id }, expiresAt);
  setCookie(c, SESSION_COOKIE, token, {
    ...cookieAttributes(isHttps(c), env.COOKIE_SAMESITE),
    // Ohne „Angemeldet bleiben“ ein echtes Session-Cookie (endet mit dem Browser) – serverseitig zusätzlich begrenzt.
    ...(remember ? { maxAge: Math.floor(ttl / 1000) } : {}),
  });
}

/** Cookie-Attribute je nach Betriebsart. `none` erzwingt Secure und Partitioned (CHIPS), wie es Browser verlangen. */
export function cookieAttributes(https: boolean, sameSite: "lax" | "none") {
  return sameSite === "none"
    ? { httpOnly: true, path: "/", sameSite: "None" as const, secure: true, partitioned: true }
    : { httpOnly: true, path: "/", sameSite: "Lax" as const, secure: https };
}

export function clearSessionCookie(c: Context): void {
  // Partitionierte Cookies müssen mit denselben Attributen gelöscht werden, mit denen sie gesetzt wurden.
  const { httpOnly: _httpOnly, ...attrs } = cookieAttributes(isHttps(c), env.COOKIE_SAMESITE);
  deleteCookie(c, SESSION_COOKIE, attrs);
}

export interface ActiveSession { sessionId: string; userId: string; role: typeof users.$inferSelect.role }

/** Prüft Cookie → JWT-Signatur → Sitzung in der DB (nicht abgelaufen, nicht widerrufen) und lädt die aktuelle Rolle. */
export async function authenticate(c: Context): Promise<ActiveSession | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  let claims;
  try { claims = await verifyToken(token); } catch { return null; }
  const [row] = await db
    .select({ sessionId: sessions.id, userId: users.id, role: users.role, lastSeenAt: sessions.lastSeenAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, claims.sid), eq(sessions.userId, claims.sub), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  if (Date.now() - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, row.sessionId));
  }
  return { sessionId: row.sessionId, userId: row.userId, role: row.role };
}

/** Sitzungs-ID aus dem Cookie, auch bei abgelaufener Sitzung (für Logout). */
export async function sessionIdFromCookie(c: Context): Promise<string | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  try { return (await verifyToken(token)).sid; } catch { return null; }
}

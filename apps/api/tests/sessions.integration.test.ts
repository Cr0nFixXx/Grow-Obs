import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { app } from "../src/app.ts";
import { client, db } from "../src/db/client.ts";
import { sessions, users } from "../src/db/schema.ts";
import { signToken } from "../src/lib/jwt.ts";
import { hashPassword } from "../src/lib/password.ts";
import { cookieAttributes, deviceLabel, parseDuration, SESSION_COOKIE } from "../src/lib/session.ts";
import { resetRateLimits } from "../src/middleware/rate-limit.ts";

const EMAIL = "sessions@example.test";
const PASSWORD = "test-password-long-enough";
const CHROME_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const SAFARI_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

type Init = { method?: string; cookie?: string; data?: unknown; headers?: Record<string, string> };
function call(path: string, { method = "GET", cookie, data, headers = {} }: Init = {}) {
  return app.request(path, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(data === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
/** "go_session=…; HttpOnly; …" aus der Antwort → { cookie: "go_session=…", raw: komplette Set-Cookie-Zeile }. */
function setCookie(res: Response) {
  const raw = res.headers.getSetCookie().find((line) => line.startsWith(`${SESSION_COOKIE}=`));
  return raw ? { raw, cookie: raw.split(";")[0]! } : null;
}
async function login(userAgent = CHROME_WIN, extra: Record<string, unknown> = {}) {
  const res = await call("/auth/login", { method: "POST", data: { email: EMAIL, password: PASSWORD, ...extra }, headers: { "User-Agent": userAgent } });
  return { res, session: setCookie(res) };
}

let userId: string;
beforeAll(async () => {
  const name = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  if (process.env.NODE_ENV !== "test" || !name.endsWith("_test")) throw new Error("Integration tests require a dedicated *_test database");
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
});
beforeEach(async () => {
  resetRateLimits();
  await db.execute(sql`TRUNCATE TABLE users CASCADE`);
  const [u] = await db.insert(users).values({ name: "Sess", email: EMAIL, handle: "sess", passwordHash: await hashPassword(PASSWORD) }).returning();
  userId = u!.id;
});
afterAll(async () => { await client.end({ timeout: 5 }); });

describe("Cookie-Login", () => {
  it("setzt ein HttpOnly/SameSite-Cookie und liefert das Token nicht im JSON-Body", async () => {
    const { res, session } = await login();
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.token).toBeUndefined();
    expect(body.user).toMatchObject({ id: userId });
    expect(session).not.toBeNull();
    expect(session!.raw).toMatch(/HttpOnly/i);
    expect(session!.raw).toMatch(/SameSite=Lax/i);
    expect(session!.raw).toMatch(/Path=\//);
    expect(session!.raw).toMatch(/Max-Age=\d+/i);
    expect((await call("/auth/me", { cookie: session!.cookie })).status).toBe(200);
  });

  it("markiert das Cookie hinter einem HTTPS-Proxy als Secure", async () => {
    const res = await call("/auth/login", { method: "POST", data: { email: EMAIL, password: PASSWORD }, headers: { "x-forwarded-proto": "https" } });
    expect(setCookie(res)!.raw).toMatch(/Secure/i);
  });

  it("ohne „Angemeldet bleiben“ ist es ein Session-Cookie (kein Max-Age) mit kurzer Serverlaufzeit", async () => {
    const { session } = await login(CHROME_WIN, { remember: false });
    expect(session!.raw).not.toMatch(/Max-Age/i);
    const [row] = await db.select().from(sessions);
    expect(row!.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(12 * 3_600_000 + 1000);
  });

  it("Registrierung legt ebenfalls eine Sitzung an", async () => {
    const res = await call("/auth/register", { method: "POST", data: { name: "Neu", email: "neu@example.test", password: PASSWORD } });
    expect(res.status).toBe(201);
    const session = setCookie(res);
    expect(session).not.toBeNull();
    expect((await call("/auth/me", { cookie: session!.cookie })).status).toBe(200);
  });

  it("falsches Passwort setzt kein Cookie", async () => {
    const res = await call("/auth/login", { method: "POST", data: { email: EMAIL, password: "falsch-falsch-falsch" } });
    expect(res.status).toBe(401);
    expect(setCookie(res)).toBeNull();
  });

  it("akzeptiert Bearer-Header nicht mehr (nur das Cookie authentifiziert)", async () => {
    const { session } = await login();
    const token = session!.cookie.slice(SESSION_COOKIE.length + 1);
    expect((await call("/auth/me", { headers: { Authorization: `Bearer ${token}` } })).status).toBe(401);
  });
});

describe("Widerruf", () => {
  it("Logout löscht die Sitzung serverseitig – das alte Cookie ist danach wertlos", async () => {
    const { session } = await login();
    const out = await call("/auth/logout", { method: "POST", cookie: session!.cookie });
    expect(out.status).toBe(204);
    expect(setCookie(out)!.raw).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    expect(await db.select().from(sessions)).toHaveLength(0);
    expect((await call("/auth/me", { cookie: session!.cookie })).status).toBe(401);
  });

  it("Logout ist idempotent und braucht keine gültige Sitzung", async () => {
    expect((await call("/auth/logout", { method: "POST" })).status).toBe(204);
    expect((await call("/auth/logout", { method: "POST", cookie: `${SESSION_COOKIE}=kaputt` })).status).toBe(204);
  });

  it("„Alle Geräte abmelden“ beendet jede Sitzung des Nutzers, aber nicht die anderer Nutzer", async () => {
    const [other] = await db.insert(users).values({ name: "Other", email: "other@example.test", handle: "other", passwordHash: await hashPassword(PASSWORD) }).returning();
    const otherSession = await db.insert(sessions).values({ userId: other!.id, expiresAt: new Date(Date.now() + 60_000) }).returning();
    const a = (await login()).session!;
    const b = (await login(SAFARI_IOS)).session!;
    expect((await call("/auth/logout-all", { method: "POST", cookie: a.cookie })).status).toBe(204);
    expect((await call("/auth/me", { cookie: a.cookie })).status).toBe(401);
    expect((await call("/auth/me", { cookie: b.cookie })).status).toBe(401);
    const remaining = await db.select().from(sessions);
    expect(remaining.map((s) => s.id)).toEqual([otherSession[0]!.id]);
  });

  it("logout-all verlangt eine Anmeldung", async () => {
    expect((await call("/auth/logout-all", { method: "POST" })).status).toBe(401);
  });

  it("abgelaufene Sitzungen werden abgelehnt, auch bei gültiger Signatur", async () => {
    const [row] = await db.insert(sessions).values({ userId, expiresAt: new Date(Date.now() + 60_000) }).returning();
    const token = await signToken({ sub: userId, role: "member", sid: row!.id }, new Date(Date.now() + 60_000));
    const cookie = `${SESSION_COOKIE}=${token}`;
    expect((await call("/auth/me", { cookie })).status).toBe(200);
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.id, row!.id));
    expect((await call("/auth/me", { cookie })).status).toBe(401);
  });

  it("ein Token mit fremder oder unbekannter Sitzungs-ID wird abgelehnt", async () => {
    const [other] = await db.insert(users).values({ name: "Other", email: "other@example.test", handle: "other", passwordHash: "x" }).returning();
    const [theirs] = await db.insert(sessions).values({ userId: other!.id, expiresAt: new Date(Date.now() + 60_000) }).returning();
    const exp = new Date(Date.now() + 60_000);
    const stolenSid = await signToken({ sub: userId, role: "member", sid: theirs!.id }, exp);
    const unknownSid = await signToken({ sub: userId, role: "member", sid: randomUUID() }, exp);
    expect((await call("/auth/me", { cookie: `${SESSION_COOKIE}=${stolenSid}` })).status).toBe(401);
    expect((await call("/auth/me", { cookie: `${SESSION_COOKIE}=${unknownSid}` })).status).toBe(401);
  });

  it("Rollenänderungen gelten sofort (Rolle wird je Request aus der DB geladen)", async () => {
    const { session } = await login();
    expect((await call("/admin/users", { cookie: session!.cookie })).status).toBe(403);
    await db.update(users).set({ role: "platform_admin" }).where(eq(users.id, userId));
    expect((await call("/admin/users", { cookie: session!.cookie })).status).toBe(200);
  });

  it("Löschen des Nutzers entfernt seine Sitzungen (Kaskade)", async () => {
    await login();
    await db.delete(users).where(eq(users.id, userId));
    expect(await db.select().from(sessions)).toHaveLength(0);
  });
});

describe("Geräteliste", () => {
  it("listet aktive Sitzungen mit Gerätebezeichnung und markiert die aktuelle", async () => {
    const a = (await login(CHROME_WIN)).session!;
    await login(SAFARI_IOS);
    const res = await call("/auth/sessions", { cookie: a.cookie });
    expect(res.status).toBe(200);
    const list = await res.json() as { id: string; device: string; current: boolean }[];
    expect(list).toHaveLength(2);
    expect(list.filter((s) => s.current)).toHaveLength(1);
    expect(list.find((s) => s.current)!.device).toBe("Chrome auf Windows");
    expect(list.find((s) => !s.current)!.device).toBe("Safari auf iOS");
    expect(JSON.stringify(list)).not.toMatch(/Mozilla/);
  });

  it("beendet eine andere Sitzung gezielt", async () => {
    const a = (await login(CHROME_WIN)).session!;
    const b = (await login(SAFARI_IOS)).session!;
    const list = await (await call("/auth/sessions", { cookie: a.cookie })).json() as { id: string; current: boolean }[];
    const other = list.find((s) => !s.current)!;
    expect((await call(`/auth/sessions/${other.id}`, { method: "DELETE", cookie: a.cookie })).status).toBe(204);
    expect((await call("/auth/me", { cookie: b.cookie })).status).toBe(401);
    expect((await call("/auth/me", { cookie: a.cookie })).status).toBe(200);
  });

  it("fremde oder ungültige Sitzungs-IDs ergeben 404 und löschen nichts", async () => {
    const [other] = await db.insert(users).values({ name: "Other", email: "other@example.test", handle: "other", passwordHash: "x" }).returning();
    const [theirs] = await db.insert(sessions).values({ userId: other!.id, expiresAt: new Date(Date.now() + 60_000) }).returning();
    const a = (await login()).session!;
    expect((await call(`/auth/sessions/${theirs!.id}`, { method: "DELETE", cookie: a.cookie })).status).toBe(404);
    expect((await call("/auth/sessions/nicht-uuid", { method: "DELETE", cookie: a.cookie })).status).toBe(404);
    expect(await db.select().from(sessions).where(eq(sessions.id, theirs!.id))).toHaveLength(1);
  });

  it("verlangt eine Anmeldung", async () => {
    expect((await call("/auth/sessions")).status).toBe(401);
  });
});

describe("CSRF-Schutz", () => {
  it("blockiert zustandsändernde Cross-Site-Browser-Requests", async () => {
    const { session } = await login();
    const evil = await call("/auth/logout-all", { method: "POST", cookie: session!.cookie, headers: { "Sec-Fetch-Site": "cross-site", Origin: "https://evil.example" } });
    expect(evil.status).toBe(403);
    expect((await call("/auth/me", { cookie: session!.cookie })).status).toBe(200);
  });

  it("blockiert auch ohne Sec-Fetch-Site, wenn der Origin fremd ist", async () => {
    const { session } = await login();
    const res = await call("/auth/logout-all", { method: "POST", cookie: session!.cookie, headers: { Origin: "https://evil.example", Host: "app.example" } });
    expect(res.status).toBe(403);
  });

  it("erlaubt same-origin und konfigurierte CORS-Origins", async () => {
    const { session } = await login();
    expect((await call("/auth/logout", { method: "POST", cookie: session!.cookie, headers: { "Sec-Fetch-Site": "same-origin" } })).status).toBe(204);
    expect((await call("/auth/logout", { method: "POST", headers: { Origin: "https://app.example", Host: "app.example" } })).status).toBe(204);
    expect((await call("/auth/logout", { method: "POST", headers: { Origin: "http://localhost:5173", "Sec-Fetch-Site": "same-site" } })).status).toBe(204);
  });

  it("schützt auch Login gegen Cross-Site-Anmeldung", async () => {
    const res = await call("/auth/login", { method: "POST", data: { email: EMAIL, password: PASSWORD }, headers: { "Sec-Fetch-Site": "cross-site", Origin: "https://evil.example" } });
    expect(res.status).toBe(403);
  });

  it("antwortet auf CORS-Preflights mit Credentials-Freigabe nur für erlaubte Origins", async () => {
    const ok = await call("/auth/login", { method: "OPTIONS", headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "POST" } });
    expect(ok.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(ok.headers.get("access-control-allow-credentials")).toBe("true");
    const bad = await call("/auth/login", { method: "OPTIONS", headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" } });
    expect(bad.headers.get("access-control-allow-origin")).not.toBe("https://evil.example");
  });
});

describe("Cookie-Attribute", () => {
  it("lax (Standard): HttpOnly, SameSite=Lax, Secure nur bei HTTPS", () => {
    expect(cookieAttributes(false, "lax")).toEqual({ httpOnly: true, path: "/", sameSite: "Lax", secure: false });
    expect(cookieAttributes(true, "lax")).toMatchObject({ sameSite: "Lax", secure: true });
  });
  it("none (iframe-Vorschau): immer Secure + Partitioned, weiterhin HttpOnly", () => {
    expect(cookieAttributes(false, "none")).toEqual({ httpOnly: true, path: "/", sameSite: "None", secure: true, partitioned: true });
  });
  it("Standardbetrieb setzt kein Partitioned/None", async () => {
    const res = await call("/auth/login", { method: "POST", data: { email: EMAIL, password: PASSWORD } });
    expect(setCookie(res)!.raw).not.toMatch(/Partitioned|SameSite=None/i);
  });
});

describe("Hilfsfunktionen", () => {
  it("parseDuration versteht s/m/h/d", () => {
    expect(parseDuration("30s")).toBe(30_000);
    expect(parseDuration("15m")).toBe(900_000);
    expect(parseDuration("12h")).toBe(43_200_000);
    expect(parseDuration("30d")).toBe(2_592_000_000);
    expect(() => parseDuration("1w")).toThrow();
  });
  it("deviceLabel ist lesbar und enthält keinen rohen User-Agent", () => {
    expect(deviceLabel(CHROME_WIN)).toBe("Chrome auf Windows");
    expect(deviceLabel(SAFARI_IOS)).toBe("Safari auf iOS");
    expect(deviceLabel("Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0")).toBe("Firefox auf Linux");
    expect(deviceLabel("")).toBe("Unbekanntes Gerät");
    expect(deviceLabel(null)).toBe("Unbekanntes Gerät");
  });
});

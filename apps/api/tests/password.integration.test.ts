import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { app } from "../src/app.ts";
import { client, db } from "../src/db/client.ts";
import { loginEvents, sessions, users } from "../src/db/schema.ts";
import { hashPassword } from "../src/lib/password.ts";
import { LOGIN_LOG_RETENTION_DAYS, MAX_SESSIONS_PER_USER, SESSION_COOKIE } from "../src/lib/session.ts";
import { resetRateLimits } from "../src/middleware/rate-limit.ts";

const EMAIL = "pw@example.test";
const PASSWORD = "test-password-long-enough";
const NEW_PASSWORD = "another-password-also-long";
const UA_CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const UA_FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0";

function call(path: string, o: { method?: string; cookie?: string; data?: unknown; ua?: string } = {}) {
  return app.request(path, {
    method: o.method ?? "GET",
    headers: { ...(o.cookie ? { Cookie: o.cookie } : {}), ...(o.ua ? { "User-Agent": o.ua } : {}), ...(o.data === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(o.data === undefined ? {} : { body: JSON.stringify(o.data) }),
  });
}
const cookieOf = (res: Response) => res.headers.getSetCookie().find((l) => l.startsWith(`${SESSION_COOKIE}=`))?.split(";")[0];
async function login(password = PASSWORD, ua = UA_CHROME, email = EMAIL) {
  const res = await call("/auth/login", { method: "POST", data: { email, password }, ua });
  return { res, cookie: cookieOf(res) };
}
const change = (cookie: string | undefined, currentPassword: string, newPassword: string) =>
  call("/auth/password", { method: "POST", cookie, data: { currentPassword, newPassword }, ua: UA_CHROME });

let userId: string;
beforeAll(async () => {
  const name = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  if (process.env.NODE_ENV !== "test" || !name.endsWith("_test")) throw new Error("Integration tests require a dedicated *_test database");
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
});
beforeEach(async () => {
  resetRateLimits();
  await db.execute(sql`TRUNCATE TABLE users CASCADE`);
  const [u] = await db.insert(users).values({ name: "Pw", email: EMAIL, handle: "pw", passwordHash: await hashPassword(PASSWORD) }).returning();
  userId = u!.id;
});
afterAll(async () => { await client.end({ timeout: 5 }); });

describe("Passwort ändern", () => {
  it("ändert das Passwort: neues geht, altes nicht mehr", async () => {
    const { cookie } = await login();
    expect((await change(cookie, PASSWORD, NEW_PASSWORD)).status).toBe(204);
    expect((await login(NEW_PASSWORD)).res.status).toBe(200);
    expect((await login(PASSWORD)).res.status).toBe(401);
  });

  it("beendet alle anderen Sitzungen, die aktuelle bleibt angemeldet", async () => {
    const a = (await login(PASSWORD, UA_CHROME)).cookie;
    const b = (await login(PASSWORD, UA_FIREFOX)).cookie;
    expect((await change(a, PASSWORD, NEW_PASSWORD)).status).toBe(204);
    expect((await call("/auth/me", { cookie: a })).status).toBe(200);
    expect((await call("/auth/me", { cookie: b })).status).toBe(401);
    expect(await db.select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(1);
  });

  it("falsches aktuelles Passwort → 403 (nicht 401), nichts ändert sich, Fehlversuch wird protokolliert", async () => {
    const { cookie } = await login();
    const res = await change(cookie, "falsch-falsch-falsch", NEW_PASSWORD);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "Aktuelles Passwort ist falsch" });
    expect((await call("/auth/me", { cookie })).status).toBe(200);
    expect((await login(PASSWORD)).res.status).toBe(200);
    const events = await db.select().from(loginEvents).where(eq(loginEvents.event, "login_failed"));
    expect(events).toHaveLength(1);
  });

  it("lehnt zu kurzes oder unverändertes neues Passwort ab", async () => {
    const { cookie } = await login();
    const short = await change(cookie, PASSWORD, "kurz");
    expect(short.status).toBe(400);
    expect(await short.json()).toMatchObject({ error: "Mindestens 12 Zeichen" });
    expect((await change(cookie, PASSWORD, PASSWORD)).status).toBe(400);
    expect((await login(PASSWORD)).res.status).toBe(200);
  });

  it("verlangt Anmeldung und begrenzt Versuche (5 je 15 min)", async () => {
    expect((await change(undefined, PASSWORD, NEW_PASSWORD)).status).toBe(401);
    const { cookie } = await login();
    for (let i = 0; i < 5; i++) expect((await change(cookie, "falsch-falsch-falsch", NEW_PASSWORD)).status).toBe(403);
    expect((await change(cookie, "falsch-falsch-falsch", NEW_PASSWORD)).status).toBe(429);
  });
});

describe("Anmeldeprotokoll", () => {
  it("protokolliert Anmeldung, Fehlschlag, Registrierung und Passwortänderung – ohne IP, mit Gerät", async () => {
    await call("/auth/register", { method: "POST", data: { name: "Neu", email: "neu@example.test", password: PASSWORD }, ua: UA_FIREFOX });
    await login("falsch-falsch-falsch", UA_FIREFOX);
    const { cookie } = await login(PASSWORD, UA_CHROME);
    await change(cookie, PASSWORD, NEW_PASSWORD);
    const res = await call("/auth/login-history", { cookie });
    expect(res.status).toBe(200);
    const list = await res.json() as { id: string; event: string; device: string; createdAt: string }[];
    expect(list.map((e) => e.event)).toEqual(["password_changed", "login", "login_failed"]); // neueste zuerst
    expect(list[0]!.device).toBe("Chrome auf Windows");
    expect(list[2]!.device).toBe("Firefox auf Linux"); // der Fehlversuch kam aus Firefox
    expect(Object.keys(list[0]!).sort()).toEqual(["createdAt", "device", "event", "id"]);
    expect(JSON.stringify(list)).not.toMatch(/Mozilla|127\.0\.0\.1|ip/i);
    // Registrierung gehört zum neuen Konto, nicht zu diesem.
    expect(list.some((e) => e.event === "register")).toBe(false);
  });

  it("Registrierung wird im eigenen Verlauf aufgeführt", async () => {
    const res = await call("/auth/register", { method: "POST", data: { name: "Neu", email: "neu@example.test", password: PASSWORD }, ua: UA_FIREFOX });
    const list = await (await call("/auth/login-history", { cookie: cookieOf(res) })).json() as { event: string; device: string }[];
    expect(list).toEqual([expect.objectContaining({ event: "register", device: "Firefox auf Linux" })]);
  });

  it("speichert keine Fehlversuche für unbekannte E-Mail-Adressen", async () => {
    await login("irgendwas-langes-xx", UA_CHROME, "niemand@example.test");
    expect(await db.select().from(loginEvents)).toHaveLength(0);
  });

  it("zeigt nur eigene Einträge und verlangt Anmeldung", async () => {
    const [other] = await db.insert(users).values({ name: "O", email: "o@example.test", handle: "o", passwordHash: "x" }).returning();
    await db.insert(loginEvents).values({ userId: other!.id, event: "login", device: "Fremdgerät" });
    const { cookie } = await login();
    const list = await (await call("/auth/login-history", { cookie })).json() as { device: string }[];
    expect(list.every((e) => e.device !== "Fremdgerät")).toBe(true);
    expect((await call("/auth/login-history")).status).toBe(401);
  });

  it("löscht Einträge nach 90 Tagen (beim nächsten Ereignis) und liefert sie nie aus", async () => {
    const old = new Date(Date.now() - (LOGIN_LOG_RETENTION_DAYS + 1) * 86_400_000);
    await db.insert(loginEvents).values({ userId, event: "login", device: "Uraltgerät", createdAt: old });
    const { cookie } = await login(); // schreibt ein neues Ereignis und räumt auf
    expect((await db.select().from(loginEvents).where(eq(loginEvents.device, "Uraltgerät")))).toHaveLength(0);
    await db.insert(loginEvents).values({ userId, event: "login", device: "Uraltgerät2", createdAt: old });
    const list = await (await call("/auth/login-history", { cookie })).json() as { device: string }[];
    expect(list.some((e) => e.device === "Uraltgerät2")).toBe(false);
  });

  it("Löschen des Nutzers entfernt sein Protokoll (Kaskade)", async () => {
    await login();
    await db.delete(users).where(eq(users.id, userId));
    expect(await db.select().from(loginEvents)).toHaveLength(0);
  });
});

describe("Gerätelimit", () => {
  it(`erlaubt höchstens ${MAX_SESSIONS_PER_USER} Sitzungen; die am längsten inaktive endet zuerst`, async () => {
    const cookies: string[] = [];
    for (let i = 0; i < MAX_SESSIONS_PER_USER; i++) {
      cookies.push((await login()).cookie!);
      await new Promise((r) => setTimeout(r, 15)); // unterscheidbare Zeitstempel
    }
    expect(await db.select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(MAX_SESSIONS_PER_USER);
    const sixth = (await login()).cookie!;
    expect(await db.select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(MAX_SESSIONS_PER_USER);
    expect((await call("/auth/me", { cookie: cookies[0] })).status).toBe(401); // älteste beendet
    for (const c of [...cookies.slice(1), sixth]) expect((await call("/auth/me", { cookie: c })).status).toBe(200);
  });

  it("eine kürzlich genutzte alte Sitzung bleibt, die längste Inaktive geht", async () => {
    const cookies: string[] = [];
    for (let i = 0; i < MAX_SESSIONS_PER_USER; i++) { cookies.push((await login()).cookie!); await new Promise((r) => setTimeout(r, 15)); }
    const rows = await db.select().from(sessions).where(eq(sessions.userId, userId));
    // Sitzung 0 wirkt „vor kurzem aktiv“, Sitzung 1 „seit Stunden inaktiv“.
    const bySid = new Map(rows.map((r) => [r.id, r]));
    const sids = cookies.map((c) => JSON.parse(Buffer.from(c.split("=")[1]!.split(".")[1]!, "base64url").toString()).sid as string);
    await db.update(sessions).set({ lastSeenAt: new Date(Date.now() - 3 * 3_600_000) }).where(eq(sessions.id, sids[1]!));
    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, sids[0]!));
    expect(bySid.size).toBe(MAX_SESSIONS_PER_USER);
    await login();
    expect((await call("/auth/me", { cookie: cookies[1] })).status).toBe(401);
    expect((await call("/auth/me", { cookie: cookies[0] })).status).toBe(200);
  });

  it("das Limit gilt je Konto, nicht global", async () => {
    const [other] = await db.insert(users).values({ name: "O", email: "o@example.test", handle: "o", passwordHash: await hashPassword(PASSWORD) }).returning();
    for (let i = 0; i < MAX_SESSIONS_PER_USER; i++) await login(PASSWORD, UA_CHROME, "o@example.test");
    const mine = (await login()).cookie!;
    expect(await db.select().from(sessions).where(eq(sessions.userId, other!.id))).toHaveLength(MAX_SESSIONS_PER_USER);
    expect((await call("/auth/me", { cookie: mine })).status).toBe(200);
  });
});

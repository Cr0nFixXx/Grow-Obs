import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { app } from "../../apps/api/src/app.ts";
import { client, db } from "../../apps/api/src/db/client.ts";
import { pushPrefs, pushSubscriptions, sessions, users } from "../../apps/api/src/db/schema.ts";
import { signToken } from "../../apps/api/src/lib/jwt.ts";
import { hashPassword } from "../../apps/api/src/lib/password.ts";
import { SESSION_COOKIE } from "../../apps/api/src/lib/session.ts";
import { invalidateFeatureCache } from "../../apps/api/src/lib/features.ts";
import { createNotification } from "../../apps/api/src/lib/notify.ts";
import { resetPushThrottle, sendPushToUser, setPushSender, type PushSender } from "../../apps/api/src/lib/push.ts";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.ts";

type Person = { id: string; cookie: string; sessionId: string };
async function person(name: string): Promise<Person> {
  const [u] = await db.insert(users).values({ name, email: `${name.toLowerCase()}@example.test`, handle: name.toLowerCase(), passwordHash: await hashPassword("test-password-long-enough") }).returning();
  const expiresAt = new Date(Date.now() + 3600_000);
  const [s] = await db.insert(sessions).values({ userId: u!.id, expiresAt, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" }).returning();
  const token = await signToken({ sub: u!.id, role: u!.role, sid: s!.id }, expiresAt);
  return { id: u!.id, cookie: `${SESSION_COOKIE}=${token}`, sessionId: s!.id };
}
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const call = (p: Person | null, path: string, method = "GET", data?: unknown) =>
  app.request(path, { method, headers: { "User-Agent": CHROME, ...(p ? { Cookie: p.cookie } : {}), ...(data === undefined ? {} : { "Content-Type": "application/json" }) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
const json = async <T = any>(res: Response) => (await res.json()) as T;

const P256DH = "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM";
const AUTH = "tBHItJI5svbpez7KI4CCXg";
const sub = (n: number | string = 1) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/device-${n}`, keys: { p256dh: P256DH, auth: AUTH } });

type Sent = { endpoint: string; payload: any; options: { ttl: number; urgency: string; topic: string } };
let sent: Sent[];
let failWith: Record<string, number> = {};
const fake: PushSender = async (s, payload, options) => {
  const status = failWith[s.endpoint];
  if (status) throw Object.assign(new Error("push failed"), { statusCode: status });
  sent.push({ endpoint: s.endpoint, payload: JSON.parse(payload), options });
};
const settle = () => new Promise((r) => setTimeout(r, 250)); // Fire-and-forget-Versand abwarten

beforeAll(async () => {
  const name = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  if (process.env.NODE_ENV !== "test" || !name.endsWith("_test")) throw new Error("Integration tests require a dedicated *_test database");
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../apps/api/drizzle", import.meta.url)) });
});
beforeEach(async () => {
  await resetRateLimits(); resetPushThrottle(); setPushSender(fake);
  sent = []; failWith = {};
  await db.execute(sql`TRUNCATE TABLE users CASCADE`);
  await db.execute(sql`DELETE FROM feature_flags`); invalidateFeatureCache();
});
afterEach(() => setPushSender(null));
afterAll(async () => { await client.end({ timeout: 5 }); });

describe("Push: Konfiguration und Abos", () => {
  it("verlangt Anmeldung und liefert den öffentlichen Schlüssel", async () => {
    expect((await call(null, "/push/config")).status).toBe(401);
    const a = await person("Anna");
    const cfg = await json(await call(a, "/push/config"));
    expect(cfg.configured).toBe(true);
    expect(cfg.publicKey).toMatch(/^B[A-Za-z0-9_-]{86}$/);
    expect(JSON.stringify(cfg)).not.toMatch(/DvS0bLSt/); // privater Schlüssel nie in der Antwort
  });

  it("legt ein Gerät an, hängt es an die Sitzung und dupliziert nicht", async () => {
    const a = await person("Anna");
    const res = await call(a, "/push/subscribe", "POST", sub());
    expect(res.status).toBe(201);
    const state = await json(res);
    expect(state.devices).toHaveLength(1);
    expect(state.devices[0]).toMatchObject({ device: expect.stringContaining("Chrome"), current: true });
    expect(JSON.stringify(state)).not.toContain("device-1"); // Endpunkt/Schlüssel werden nicht zurückgegeben
    await call(a, "/push/subscribe", "POST", sub());
    expect((await json(await call(a, "/push"))).devices).toHaveLength(1);
  });

  it("lehnt unbekannte Hosts, HTTP und fehlerhafte Schlüssel ab", async () => {
    const a = await person("Anna");
    for (const bad of [
      { ...sub(), endpoint: "https://evil.example/push" }, { ...sub(), endpoint: "http://fcm.googleapis.com/x" }, { ...sub(), endpoint: "https://127.0.0.1/x" },
      { ...sub(), keys: { p256dh: "kurz", auth: AUTH } }, { ...sub(), keys: { p256dh: P256DH, auth: "ungültig!!" } }, { endpoint: sub().endpoint }, {},
    ]) expect((await call(a, "/push/subscribe", "POST", bad)).status).toBe(400);
    expect(await db.select().from(pushSubscriptions)).toHaveLength(0);
  });

  it("begrenzt auf 5 Geräte (das älteste fällt weg) und hängt einen Endpunkt auf das neue Konto um", async () => {
    const a = await person("Anna"), b = await person("Bernd");
    for (let i = 1; i <= 6; i++) { await call(a, "/push/subscribe", "POST", sub(i)); await new Promise((r) => setTimeout(r, 5)); }
    const endpoints = (await db.select().from(pushSubscriptions)).map((s) => s.endpoint).sort();
    expect(endpoints).toHaveLength(5);
    expect(endpoints).not.toContain(sub(1).endpoint);
    await call(b, "/push/subscribe", "POST", sub(6));
    const row = (await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, sub(6).endpoint)))[0]!;
    expect(row.userId).toBe(b.id);
    expect((await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, a.id)))).toHaveLength(4);
  });

  it("Abmelden entfernt nur das eigene Gerät; fremde Geräte-IDs sind tabu", async () => {
    const a = await person("Anna"), b = await person("Bernd");
    await call(a, "/push/subscribe", "POST", sub(1)); await call(b, "/push/subscribe", "POST", sub(2));
    const bDevice = (await json(await call(b, "/push"))).devices[0].id;
    await call(a, `/push/devices/${bDevice}`, "DELETE");
    expect(await db.select().from(pushSubscriptions)).toHaveLength(2);
    await call(a, "/push/unsubscribe", "POST", { endpoint: sub(2).endpoint }); // fremder Endpunkt
    expect(await db.select().from(pushSubscriptions)).toHaveLength(2);
    await call(a, "/push/unsubscribe", "POST", { endpoint: sub(1).endpoint });
    expect((await db.select().from(pushSubscriptions)).map((s) => s.userId)).toEqual([b.id]);
    expect((await call(a, "/push/devices/kein-uuid", "DELETE")).status).toBe(400);
  });

  it("endet mit der Sitzung (Abmeldung/„Alle Geräte“) und mit dem Konto", async () => {
    const a = await person("Anna");
    await call(a, "/push/subscribe", "POST", sub(1));
    await db.delete(sessions).where(eq(sessions.id, a.sessionId));
    expect(await db.select().from(pushSubscriptions)).toHaveLength(0);
  });
});

describe("Push: Einstellungen", () => {
  it("hat Standardwerte und speichert Teiländerungen validiert", async () => {
    const a = await person("Anna");
    expect((await json(await call(a, "/push"))).prefs).toEqual({ messages: true, community: true, grows: true, other: true, showPreview: false, quietEnabled: false, quietStart: "22:00", quietEnd: "07:00", timezone: "Europe/Berlin" });
    const res = await json(await call(a, "/push/prefs", "PUT", { community: false, quietEnabled: true, quietStart: "23:15", timezone: "America/New_York" }));
    expect(res.prefs).toMatchObject({ messages: true, community: false, quietEnabled: true, quietStart: "23:15", quietEnd: "07:00", timezone: "America/New_York" });
    await call(a, "/push/prefs", "PUT", { showPreview: true });
    expect((await json(await call(a, "/push"))).prefs).toMatchObject({ community: false, showPreview: true, quietStart: "23:15" });
    expect(await db.select().from(pushPrefs)).toHaveLength(1);
  });
  it("lehnt ungültige Werte ab", async () => {
    const a = await person("Anna");
    for (const bad of [{ messages: "ja" }, { quietStart: "25:00" }, { quietEnd: "7:00" }, { timezone: "Mars/Olympus" }, { timezone: "x".repeat(80) }]) expect((await call(a, "/push/prefs", "PUT", bad)).status).toBe(400);
  });
  it("Einstellungen sind je Konto getrennt", async () => {
    const a = await person("Anna"), b = await person("Bernd");
    await call(a, "/push/prefs", "PUT", { messages: false });
    expect((await json(await call(b, "/push"))).prefs.messages).toBe(true);
  });
});

describe("Push: Versand", () => {
  it("Benachrichtigung → neutraler Push an alle Geräte (ohne Namen/Text), mit Ziel und Gruppierung", async () => {
    const a = await person("Anna");
    await call(a, "/push/subscribe", "POST", sub(1)); await call(a, "/push/subscribe", "POST", sub(2));
    await createNotification(a.id, { type: "forum", title: "Bernd hat geantwortet", body: "Geheimer Text" });
    await settle();
    expect(sent.map((s) => s.endpoint).sort()).toEqual([sub(1).endpoint, sub(2).endpoint]);
    expect(sent[0]!.payload).toMatchObject({ title: "Neue Aktivität in der Community", url: "/forum", category: "community" });
    expect(JSON.stringify(sent)).not.toMatch(/Bernd|Geheimer/);
    expect(sent[0]!.options).toMatchObject({ ttl: 86400, urgency: "normal" });
    expect(sent[0]!.options.topic).toMatch(/^[A-Za-z0-9_-]{1,32}$/);
    // die In-App-Benachrichtigung bleibt unabhängig vom Push bestehen
    expect((await json(await call(a, "/notifications"))).length).toBe(1);
  });

  it("zeigt mit „Vorschau“ den echten Titel und Text", async () => {
    const a = await person("Anna");
    await call(a, "/push/subscribe", "POST", sub()); await call(a, "/push/prefs", "PUT", { showPreview: true });
    await createNotification(a.id, { type: "grow", title: "Ernte steht an", body: "Woche 9 beginnt" });
    await settle();
    expect(sent[0]!.payload).toMatchObject({ title: "Ernte steht an", body: "Woche 9 beginnt", category: "grows" });
  });

  it("respektiert die Kategorien (abgeschaltet → kein Push, die anderen laufen weiter)", async () => {
    const a = await person("Anna");
    await call(a, "/push/subscribe", "POST", sub()); await call(a, "/push/prefs", "PUT", { community: false });
    expect((await sendPushToUser(a.id, { category: "community", title: "x", url: "/forum" })).skipped).toBe("category-off");
    expect((await sendPushToUser(a.id, { category: "grows", title: "x", url: "/grows" })).sent).toBe(1);
  });

  it("schweigt in der Ruhezeit (Zeitzone des Nutzers) und danach nicht", async () => {
    const a = await person("Anna");
    await call(a, "/push/subscribe", "POST", sub());
    await call(a, "/push/prefs", "PUT", { quietEnabled: true, quietStart: "22:00", quietEnd: "07:00", timezone: "Europe/Berlin" });
    const night = new Date("2026-10-20T21:00:00Z"), day = new Date("2026-10-20T10:00:00Z"); // 23:00 / 12:00 Berlin
    expect((await sendPushToUser(a.id, { category: "other", title: "x", url: "/" }, { now: night })).skipped).toBe("quiet-hours");
    expect((await sendPushToUser(a.id, { category: "other", title: "x", url: "/", tag: "t2" }, { now: day })).sent).toBe(1);
  });

  it("schweigt, solange der Nutzer online ist (Live-Verbindung)", async () => {
    const a = await person("Anna");
    await call(a, "/push/subscribe", "POST", sub());
    await db.update(users).set({ onlineUntil: new Date(Date.now() + 60_000) }).where(eq(users.id, a.id));
    expect((await sendPushToUser(a.id, { category: "other", title: "x", url: "/" })).skipped).toBe("online");
    await db.update(users).set({ onlineUntil: new Date(Date.now() - 1000) }).where(eq(users.id, a.id));
    expect((await sendPushToUser(a.id, { category: "other", title: "x", url: "/" })).sent).toBe(1);
  });

  it("drosselt Fluten gleicher Art (ein Push je Gruppe in 15 s)", async () => {
    const a = await person("Anna");
    await call(a, "/push/subscribe", "POST", sub());
    const input = { category: "messages" as const, title: "x", url: "/chat", tag: "go-chat-abc" };
    expect((await sendPushToUser(a.id, input)).sent).toBe(1);
    expect((await sendPushToUser(a.id, input)).skipped).toBe("throttled");
    expect((await sendPushToUser(a.id, { ...input, tag: "go-chat-other" })).sent).toBe(1);
  });

  it("ist aus, wenn das Feature `push` deaktiviert ist (Route 403, kein Versand)", async () => {
    const a = await person("Anna");
    await call(a, "/push/subscribe", "POST", sub());
    await db.execute(sql`INSERT INTO feature_flags (key, enabled) VALUES ('push', false)`); invalidateFeatureCache();
    const res = await call(a, "/push/config");
    expect(res.status).toBe(403);
    expect(await json(res)).toMatchObject({ feature: "push" });
    expect((await sendPushToUser(a.id, { category: "other", title: "x", url: "/" })).skipped).toBe("feature-off");
    expect(sent).toHaveLength(0);
  });

  it("entfernt Abos bei 404/410, zählt sonstige Fehler und räumt tote Geräte nach 5 Fehlschlägen ab", async () => {
    const a = await person("Anna");
    for (const i of [1, 2, 3]) await call(a, "/push/subscribe", "POST", sub(i));
    failWith = { [sub(1).endpoint]: 410, [sub(2).endpoint]: 503 };
    const r = await sendPushToUser(a.id, { category: "other", title: "x", url: "/" }, { force: true });
    expect(r.sent).toBe(1);
    const left = await db.select().from(pushSubscriptions);
    expect(left.map((s) => s.endpoint).sort()).toEqual([sub(2).endpoint, sub(3).endpoint]);
    expect(left.find((s) => s.endpoint === sub(2).endpoint)!.failureCount).toBe(1);
    for (let i = 0; i < 4; i++) await sendPushToUser(a.id, { category: "other", title: "x", url: "/" }, { force: true });
    expect((await db.select().from(pushSubscriptions)).map((s) => s.endpoint)).toEqual([sub(3).endpoint]);
  });

  it("ein Versandfehler lässt die auslösende Anfrage nie scheitern", async () => {
    const a = await person("Anna");
    await call(a, "/push/subscribe", "POST", sub());
    setPushSender(async () => { throw new Error("Netz weg"); });
    await expect(createNotification(a.id, { type: "system", title: "t" })).resolves.toBeUndefined();
    await settle();
  });

  it("Direktnachricht → Push nur an das Gegenüber (neutral, Kategorie messages, hohe Dringlichkeit)", async () => {
    const a = await person("Anna"), b = await person("Bernd");
    await call(a, "/push/subscribe", "POST", sub(1)); await call(b, "/push/subscribe", "POST", sub(2));
    const conv = await json(await call(a, "/chat", "POST", { userId: b.id }));
    expect((await call(a, `/chat/${conv.id}/messages`, "POST", { text: "Hallo Bernd, geheim" })).status).toBe(201);
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.endpoint).toBe(sub(2).endpoint);
    expect(sent[0]!.payload).toMatchObject({ title: "Neue Nachricht", url: "/chat", category: "messages" });
    expect(sent[0]!.options.urgency).toBe("high");
    expect(JSON.stringify(sent)).not.toMatch(/Anna|geheim/);
  });

  it("Direktnachricht mit Vorschau zeigt Absendername und Textanfang", async () => {
    const a = await person("Anna"), b = await person("Bernd");
    await call(b, "/push/subscribe", "POST", sub(2)); await call(b, "/push/prefs", "PUT", { showPreview: true });
    const conv = await json(await call(a, "/chat", "POST", { userId: b.id }));
    await call(a, `/chat/${conv.id}/messages`, "POST", { text: "Hallo   Bernd" });
    await settle();
    expect(sent[0]!.payload).toMatchObject({ title: "Anna", body: "Hallo Bernd" });
  });

  it("Test-Push: nur mit Gerät, ignoriert Kategorien/Ruhezeit, begrenzt auf 6 pro Minute", async () => {
    const a = await person("Anna");
    expect((await call(a, "/push/test", "POST")).status).toBe(409);
    await call(a, "/push/subscribe", "POST", sub());
    await call(a, "/push/prefs", "PUT", { other: false, quietEnabled: true, quietStart: "00:00", quietEnd: "23:59" });
    const res = await call(a, "/push/test", "POST");
    expect(await json(res)).toEqual({ sent: 1 });
    expect(sent[0]!.payload.title).toBe("Test-Benachrichtigung");
    for (let i = 0; i < 4; i++) await call(a, "/push/test", "POST");
    expect((await call(a, "/push/test", "POST")).status).toBe(429);
  });
});

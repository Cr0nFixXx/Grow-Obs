import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { app } from "../../apps/api/src/app.ts";
import { client, db } from "../../apps/api/src/db/client.ts";
import { messages, users } from "../../apps/api/src/db/schema.ts";
import { hashPassword } from "../../apps/api/src/lib/password.ts";
import { SESSION_COOKIE } from "../../apps/api/src/lib/session.ts";
import { expireLiveStatuses } from "../../apps/api/src/lib/status.ts";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.ts";

const PASSWORD = "test-password-long-enough";

function call(path: string, { method = "GET", cookie, data }: { method?: string; cookie?: string; data?: unknown } = {}) {
  return app.request(path, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(data === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
async function makeUser(key: string) {
  const [row] = await db.insert(users).values({ email: `${key}@example.org`, name: `Name ${key}`, handle: key, passwordHash: await hashPassword(PASSWORD) }).returning({ id: users.id });
  const res = await call("/auth/login", { method: "POST", data: { email: `${key}@example.org`, password: PASSWORD } });
  const raw = res.headers.getSetCookie().find((line) => line.startsWith(`${SESSION_COOKIE}=`))!;
  return { id: row!.id, handle: key, cookie: raw.split(";")[0]! };
}
type Who = Awaited<ReturnType<typeof makeUser>>;
const json = async <T = any>(res: Response) => (await res.json()) as T;
const patchMe = (who: Who, data: Record<string, unknown>) => call("/auth/me", { method: "PATCH", cookie: who.cookie, data });
const profileOf = async (viewer: Who, handle: string) => json(await call(`/members/${handle}`, { cookie: viewer.cookie }));
const IMG = "https://example.org/status.jpg";

beforeAll(async () => {
  const name = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  if (process.env.NODE_ENV !== "test" || !name.endsWith("_test")) throw new Error("Integration tests require a dedicated *_test database");
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../apps/api/drizzle", import.meta.url)) });
});
beforeEach(async () => {
  await resetRateLimits();
  await db.execute(sql`TRUNCATE TABLE users, conversations CASCADE`);
});
afterAll(async () => { await client.end({ timeout: 2 }); });

async function trio() {
  const owner = await makeUser("olli");
  const fan = await makeUser("fan");
  const stranger = await makeUser("stranger");
  await call("/members/olli/follow", { method: "POST", cookie: fan.cookie });
  return { owner, fan, stranger };
}

describe("Textstatus (B-97)", () => {
  it("wird gespeichert, kommt in /auth/me zurück und ist leerbar", async () => {
    const { owner, stranger } = await trio();
    const res = await patchMe(owner, { statusEmoji: "🌱", statusText: "Woche 3 Blüte" });
    expect(res.status).toBe(200);
    expect((await json(res)).status).toEqual({ emoji: "🌱", text: "Woche 3 Blüte", visibility: "all" });
    expect((await profileOf(stranger, "olli")).status).toEqual({ emoji: "🌱", text: "Woche 3 Blüte" });
    await patchMe(owner, { statusEmoji: "", statusText: "" });
    expect((await profileOf(stranger, "olli")).status).toBeNull();
  });

  it("lehnt zu lange Eingaben und unbekannte Sichtbarkeit ab", async () => {
    const { owner } = await trio();
    expect((await patchMe(owner, { statusText: "x".repeat(81) })).status).toBe(400);
    expect((await patchMe(owner, { statusEmoji: "123456789" })).status).toBe(400);
    expect((await patchMe(owner, { statusVisibility: "everyone" })).status).toBe(400);
  });

  it("Sichtbarkeit: Alle / Nur Follower / Niemand", async () => {
    const { owner, fan, stranger } = await trio();
    await patchMe(owner, { statusText: "Hallo", statusVisibility: "followers" });
    expect((await profileOf(fan, "olli")).status).toMatchObject({ text: "Hallo" });
    expect((await profileOf(stranger, "olli")).status).toBeNull();
    await patchMe(owner, { statusVisibility: "nobody" });
    expect((await profileOf(fan, "olli")).status).toBeNull();
    expect((await profileOf(owner, "olli")).status).toMatchObject({ text: "Hallo" });
  });

  it("folgt dem Profil-Datenschutz: privates Profil zeigt keinen Status, auch bei Einstellung „Alle“", async () => {
    const { owner, stranger } = await trio();
    await patchMe(owner, { statusText: "Hallo" });
    await db.update(users).set({ profileVisibility: "nobody" }).where(eq(users.id, owner.id));
    const view = await profileOf(stranger, "olli");
    expect(view.restricted).toBe(true);
    expect(view.status).toBeUndefined();
  });

  it("Follower-Listen zeigen den Status je Betrachter gefiltert", async () => {
    const { owner, fan } = await trio();
    await patchMe(fan, { statusText: "Nur für Follower", statusVisibility: "followers" });
    const before = await json<any[]>(await call("/members/olli/followers", { cookie: owner.cookie }));
    expect(before.find((p) => p.handle === "fan").status).toBeNull();
    await call("/members/fan/follow", { method: "POST", cookie: owner.cookie });
    const after = await json<any[]>(await call("/members/olli/followers", { cookie: owner.cookie }));
    expect(after.find((p) => p.handle === "fan").status).toMatchObject({ text: "Nur für Follower" });
    // Auch die Folge-Liste (`following`) und der Eigentümer selbst.
    const mine = await json<any[]>(await call("/members/fan/following", { cookie: fan.cookie }));
    expect(mine.find((p) => p.handle === "olli").status).toBeNull();
    const own = await json<any[]>(await call("/members/olli/followers", { cookie: fan.cookie }));
    expect(own.find((p) => p.handle === "fan").status).toMatchObject({ text: "Nur für Follower" });
  });
});

describe("24h-Status (B-97)", () => {
  it("läuft 24 Stunden, mit Text und Foto, nur einer je Person", async () => {
    const { owner, stranger } = await trio();
    const before = Date.now();
    const res = await patchMe(owner, { live: { text: "Topping heute", image: IMG, visibility: "all" } });
    expect(res.status).toBe(200);
    const live = (await json(res)).live;
    expect(live).toMatchObject({ text: "Topping heute", image: IMG, visibility: "all" });
    const expires = new Date(live.expiresAt).getTime();
    expect(expires - before).toBeGreaterThan(24 * 3_600_000 - 5000);
    expect(expires - before).toBeLessThan(24 * 3_600_000 + 5000);
    expect((await profileOf(stranger, "olli")).live).toMatchObject({ text: "Topping heute", image: IMG });
    await patchMe(owner, { live: { text: "Neu", visibility: "all" } });
    const next = (await profileOf(stranger, "olli")).live;
    expect(next).toMatchObject({ text: "Neu", image: "" });
  });

  it("braucht Text oder Foto, begrenzt auf 140 Zeichen", async () => {
    const { owner } = await trio();
    expect((await patchMe(owner, { live: { text: "", visibility: "all" } })).status).toBe(400);
    expect((await patchMe(owner, { live: { text: "x".repeat(141), visibility: "all" } })).status).toBe(400);
    expect((await patchMe(owner, { live: { text: "", image: IMG, visibility: "all" } })).status).toBe(200);
    expect((await patchMe(owner, { live: { text: "ok", image: "javascript:alert(1)", visibility: "all" } })).status).toBe(400);
  });

  it("lässt sich entfernen", async () => {
    const { owner, stranger } = await trio();
    await patchMe(owner, { live: { text: "Kurz da", visibility: "all" } });
    const res = await patchMe(owner, { live: null });
    expect((await json(res)).live).toBeNull();
    expect((await profileOf(stranger, "olli")).live).toBeNull();
  });

  it("Sichtbarkeit folgt dem Schalter; der Eigentümer sieht ihn immer", async () => {
    const { owner, fan, stranger } = await trio();
    await patchMe(owner, { live: { text: "Nur Follower", visibility: "followers" } });
    expect((await profileOf(fan, "olli")).live).toMatchObject({ text: "Nur Follower" });
    expect((await profileOf(stranger, "olli")).live).toBeNull();
    await patchMe(owner, { live: { text: "Niemand", visibility: "nobody" } });
    expect((await profileOf(fan, "olli")).live).toBeNull();
    expect((await json(await call("/auth/me", { cookie: owner.cookie }))).live).toMatchObject({ text: "Niemand" });
  });

  it("abgelaufene werden nirgends angezeigt und vom Aufräumlauf geleert", async () => {
    const { owner, stranger } = await trio();
    await patchMe(owner, { live: { text: "Alt", image: IMG, visibility: "all" } });
    await db.update(users).set({ liveExpiresAt: new Date(Date.now() - 60_000) }).where(eq(users.id, owner.id));
    expect((await profileOf(stranger, "olli")).live).toBeNull();
    expect((await json(await call("/auth/me", { cookie: owner.cookie }))).live).toBeNull();
    const swept = await expireLiveStatuses();
    expect(swept.expired).toBe(1);
    const [row] = await db.select({ t: users.liveText, i: users.liveImage, e: users.liveExpiresAt }).from(users).where(eq(users.id, owner.id));
    expect(row).toEqual({ t: "", i: null, e: null });
    expect((await expireLiveStatuses()).expired).toBe(0);
  });
});

describe("Antwort auf den 24h-Status (B-97)", () => {
  const send = (who: Who, conv: string, data: Record<string, unknown>) => call(`/chat/${conv}/messages`, { method: "POST", cookie: who.cookie, data });
  const direct = async (a: Who, b: Who) => (await json(await call("/chat", { method: "POST", cookie: a.cookie, data: { userId: b.id } }))).id as string;

  it("zitiert den Status serverseitig; der Client kann keinen Text vorgeben", async () => {
    const { owner, fan } = await trio();
    await patchMe(owner, { live: { text: "Echter Statustext", visibility: "all" } });
    const conv = await direct(fan, owner);
    const res = await send(fan, conv, { text: "Schick!", statusReply: true, statusQuote: "gefälscht" });
    expect(res.status).toBe(201);
    expect((await json(res)).statusQuote).toBe("Echter Statustext");
    const history = await json<any[]>(await call(`/chat/${conv}/messages`, { cookie: owner.cookie }));
    expect(history[0]).toMatchObject({ text: "Schick!", statusQuote: "Echter Statustext" });
  });

  it("Foto ohne Text wird als „📷 Foto“ zitiert; ohne aktiven oder sichtbaren Status 400", async () => {
    const { owner, fan, stranger } = await trio();
    const conv = await direct(fan, owner);
    expect((await send(fan, conv, { text: "Hi", statusReply: true })).status).toBe(400);
    await patchMe(owner, { live: { text: "", image: IMG, visibility: "followers" } });
    expect((await json(await send(fan, conv, { text: "Hi", statusReply: true }))).statusQuote).toBe("📷 Foto");
    const other = await direct(stranger, owner);
    expect((await send(stranger, other, { text: "Hi", statusReply: true })).status).toBe(400);
    await db.update(users).set({ liveExpiresAt: new Date(Date.now() - 1000) }).where(eq(users.id, owner.id));
    expect((await send(fan, conv, { text: "Hi", statusReply: true })).status).toBe(400);
  });

  it("normale Nachrichten haben kein Zitat; das Zitat bleibt nach Ablauf des Status stehen und verschwindet mit der Nachricht", async () => {
    const { owner, fan } = await trio();
    await patchMe(owner, { live: { text: "Status", visibility: "all" } });
    const conv = await direct(fan, owner);
    expect((await json(await send(fan, conv, { text: "normal" }))).statusQuote).toBeNull();
    const reply = await json(await send(fan, conv, { text: "mit Zitat", statusReply: true }));
    await db.update(users).set({ liveText: "", liveExpiresAt: null }).where(eq(users.id, owner.id));
    const history = await json<any[]>(await call(`/chat/${conv}/messages`, { cookie: fan.cookie }));
    expect(history.find((m) => m.id === reply.id).statusQuote).toBe("Status");
    await call(`/chat/${conv}/messages/${reply.id}`, { method: "DELETE", cookie: fan.cookie });
    const after = await json<any[]>(await call(`/chat/${conv}/messages`, { cookie: fan.cookie }));
    expect(after.find((m) => m.id === reply.id)).toMatchObject({ deleted: true, statusQuote: null });
    const [row] = await db.select({ q: messages.statusQuote }).from(messages).where(eq(messages.id, reply.id));
    expect(row!.q).toBe("Status");
  });

  it("Konversationsliste und Direktchat liefern partnerStatus / partnerLive nach Sichtbarkeit", async () => {
    const { owner, fan, stranger } = await trio();
    await patchMe(owner, { statusEmoji: "🔥", statusText: "Blüte", live: { text: "Live", visibility: "followers" } });
    const a = await json(await call("/chat", { method: "POST", cookie: fan.cookie, data: { userId: owner.id } }));
    expect(a.partnerStatus).toEqual({ emoji: "🔥", text: "Blüte" });
    expect(a.partnerLive).toMatchObject({ text: "Live" });
    const b = await json(await call("/chat", { method: "POST", cookie: stranger.cookie, data: { userId: owner.id } }));
    expect(b.partnerStatus).toEqual({ emoji: "🔥", text: "Blüte" });
    expect(b.partnerLive).toBeNull();
    const listed = await json<any[]>(await call("/chat", { cookie: fan.cookie }));
    expect(listed.find((c) => c.partnerHandle === "olli").partnerLive).toMatchObject({ text: "Live" });
  });
});

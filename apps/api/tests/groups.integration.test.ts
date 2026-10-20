import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { app } from "../src/app.ts";
import { client, db } from "../src/db/client.ts";
import { conversationInvites, conversationMembers, conversations, messages, notifications, pushSubscriptions, sessions, users } from "../src/db/schema.ts";
import { signToken } from "../src/lib/jwt.ts";
import { hashPassword } from "../src/lib/password.ts";
import { SESSION_COOKIE } from "../src/lib/session.ts";
import { resetPushThrottle, setPushSender, type PushSender } from "../src/lib/push.ts";
import { resetRateLimits } from "../src/middleware/rate-limit.ts";
import { resetTypingThrottle } from "../src/realtime/commands.ts";

type Person = { id: string; cookie: string; name: string };
async function person(name: string): Promise<Person> {
  const [u] = await db.insert(users).values({ name, email: `${name.toLowerCase()}@example.test`, handle: name.toLowerCase(), passwordHash: await hashPassword("test-password-long-enough") }).returning();
  const expiresAt = new Date(Date.now() + 3600_000);
  const [s] = await db.insert(sessions).values({ userId: u!.id, expiresAt }).returning();
  const token = await signToken({ sub: u!.id, role: u!.role, sid: s!.id }, expiresAt);
  return { id: u!.id, cookie: `${SESSION_COOKIE}=${token}`, name };
}
const call = (p: Person | null, path: string, method = "GET", data?: unknown) =>
  app.request(path, { method, headers: { ...(p ? { Cookie: p.cookie } : {}), ...(data === undefined ? {} : { "Content-Type": "application/json" }) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
const json = async <T = any>(res: Response) => (await res.json()) as T;

const sent: { endpoint: string; payload: any }[] = [];
const fake: PushSender = async (s, payload) => { sent.push({ endpoint: s.endpoint, payload: JSON.parse(payload) }); };
const settle = () => new Promise((r) => setTimeout(r, 250));

beforeAll(async () => {
  const name = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  if (process.env.NODE_ENV !== "test" || !name.endsWith("_test")) throw new Error("Integration tests require a dedicated *_test database");
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
});
beforeEach(async () => {
  await resetRateLimits(); resetPushThrottle(); resetTypingThrottle(); setPushSender(fake); sent.length = 0;
  await db.execute(sql`TRUNCATE TABLE users CASCADE`);
  await db.execute(sql`TRUNCATE TABLE conversations CASCADE`);
});
afterEach(() => setPushSender(null));
afterAll(async () => { await client.end({ timeout: 5 }); });

/** Gruppe anlegen und alle Eingeladenen annehmen lassen. */
async function group(admin: Person, others: Person[], name = "Growfreunde") {
  const res = await call(admin, "/chat/groups", "POST", { name, userIds: others.map((o) => o.id) });
  expect(res.status).toBe(201);
  const g = await json(res);
  for (const o of others) {
    const invites = await json(await call(o, "/chat/invites"));
    const inv = invites.find((i: any) => i.conversationId === g.id);
    expect((await call(o, `/chat/invites/${inv.id}/accept`, "POST")).status).toBe(200);
  }
  return json(await call(admin, `/chat/groups/${g.id}`));
}
const topicsOf = async (p: Person, id: string) => (await json(await call(p, `/chat/groups/${id}`))).topics as any[];
const msgs = async (p: Person, id: string, topicId?: string) => json<any[]>(await call(p, `/chat/${id}/messages${topicId ? `?topicId=${topicId}` : ""}`));
const send = (p: Person, id: string, text: string, topicId?: string) => call(p, `/chat/${id}/messages`, "POST", { text, topicId });

describe("Gruppen: anlegen", () => {
  it("verlangt Anmeldung, einen Namen und mindestens eine eingeladene Person", async () => {
    const a = await person("Anna"); const b = await person("Bernd");
    expect((await call(null, "/chat/groups", "POST", { name: "X", userIds: [b.id] })).status).toBe(401);
    expect((await call(a, "/chat/groups", "POST", { name: "  ", userIds: [b.id] })).status).toBe(400);
    expect((await call(a, "/chat/groups", "POST", { name: "x".repeat(61), userIds: [b.id] })).status).toBe(400);
    expect((await call(a, "/chat/groups", "POST", { name: "Gruppe", userIds: [] })).status).toBe(400);
    expect((await call(a, "/chat/groups", "POST", { name: "Gruppe", userIds: [a.id] })).status).toBe(400);
  });

  it("macht den Ersteller zum Admin, legt „Allgemein“ an und lädt ein – Beitritt erst nach Annahme", async () => {
    const a = await person("Anna"); const b = await person("Bernd");
    const res = await call(a, "/chat/groups", "POST", { name: "Growfreunde", userIds: [b.id] });
    const g = await json(res);
    expect(g).toMatchObject({ name: "Growfreunde", role: "admin", memberCount: 1, historyVisible: false });
    expect(g.topics).toHaveLength(1);
    expect(g.topics[0]).toMatchObject({ name: "Allgemein", isDefault: true, canWrite: true });
    expect(g.invites).toHaveLength(1);
    // Bernd ist noch kein Mitglied: keine Details, kein Verlauf, nicht in seiner Liste.
    expect((await call(b, `/chat/groups/${g.id}`)).status).toBe(404);
    expect((await call(b, `/chat/${g.id}/messages`)).status).toBe(404);
    expect((await json(await call(b, "/chat"))).some((c: any) => c.id === g.id)).toBe(false);
    const invites = await json(await call(b, "/chat/invites"));
    expect(invites).toHaveLength(1);
    expect(invites[0]).toMatchObject({ groupName: "Growfreunde", inviterName: "Anna", memberCount: 1 });
    const [n] = await db.select().from(notifications).where(eq(notifications.userId, b.id));
    expect(n!.title).toBe("Einladung zur Gruppe „Growfreunde“");
    expect((await call(b, `/chat/invites/${invites[0].id}/accept`, "POST")).status).toBe(200);
    const after = await json(await call(b, `/chat/groups/${g.id}`));
    expect(after).toMatchObject({ role: "member", memberCount: 2 });
    expect(after.invites).toEqual([]); // nur Admins sehen Einladungen
    const list = await json(await call(b, "/chat"));
    expect(list.find((c: any) => c.id === g.id)).toMatchObject({ isGroup: true, name: "Growfreunde", role: "member", memberCount: 2 });
  });

  it("schreibt Hinweiszeilen in den Verlauf (erstellt, eingeladen, beigetreten)", async () => {
    const a = await person("Anna"); const b = await person("Bernd");
    const g = await group(a, [b]);
    const list = await msgs(a, g.id);
    expect(list.map((m) => m.kind)).toEqual(["system", "system", "system"]);
    expect(list.map((m) => m.text)).toEqual(["Anna hat die Gruppe erstellt", "Anna hat Bernd eingeladen", "Bernd ist der Gruppe beigetreten"]);
  });

  it("begrenzt Mitglieder inklusive offener Einladungen auf 20", async () => {
    const a = await person("Anna");
    const many: Person[] = [];
    for (let i = 0; i < 19; i++) many.push(await person(`User${i}`));
    const res = await call(a, "/chat/groups", "POST", { name: "Voll", userIds: many.map((u) => u.id) });
    expect(res.status).toBe(201);
    const g = await json(res);
    const extra = await person("Extra");
    const full = await call(a, `/chat/groups/${g.id}/invites`, "POST", { userIds: [extra.id] });
    expect(full.status).toBe(409);
    expect((await json(full)).error).toMatch(/Gruppe voll/);
    expect((await call(a, "/chat/groups", "POST", { name: "Zu groß", userIds: [...many.map((u) => u.id), extra.id] })).status).toBe(400);
  });
});

describe("Gruppen: Einladungen", () => {
  it("nur Admins laden ein; Bereits-eingeladene und Mitglieder werden übersprungen", async () => {
    const a = await person("Anna"); const b = await person("Bernd"); const c = await person("Chris");
    const g = await group(a, [b]);
    expect((await call(b, `/chat/groups/${g.id}/invites`, "POST", { userIds: [c.id] })).status).toBe(403);
    const first = await json(await call(a, `/chat/groups/${g.id}/invites`, "POST", { userIds: [b.id, c.id] }));
    expect(first.invited).toEqual([c.id]);
    expect(first.skipped).toEqual([{ userId: b.id, reason: "Ist schon Mitglied" }]);
    const again = await json(await call(a, `/chat/groups/${g.id}/invites`, "POST", { userIds: [c.id] }));
    expect(again.invited).toEqual([]);
    expect(again.skipped[0].reason).toBe("Bereits eingeladen");
  });

  it("Ablehnen, Zurückziehen und Ablaufen schließen die Einladung; erneutes Einladen ist danach möglich", async () => {
    const a = await person("Anna"); const b = await person("Bernd"); const c = await person("Chris");
    const g = await json(await call(a, "/chat/groups", "POST", { name: "G", userIds: [b.id, c.id] }));
    const [ib] = await json(await call(b, "/chat/invites"));
    expect((await call(b, `/chat/invites/${ib.id}/decline`, "POST")).status).toBe(204);
    expect((await call(b, `/chat/invites/${ib.id}/accept`, "POST")).status).toBe(409);
    expect(await json(await call(b, "/chat/invites"))).toEqual([]);
    const detail = await json(await call(a, `/chat/groups/${g.id}`));
    expect(detail.invites.map((i: any) => i.userId)).toEqual([c.id]);
    // Zurückziehen: nur Admins, Einladung verschwindet beim Eingeladenen
    expect((await call(c, `/chat/groups/${g.id}/invites/${detail.invites[0].id}`, "DELETE")).status).toBe(404);
    expect((await call(a, `/chat/groups/${g.id}/invites/${detail.invites[0].id}`, "DELETE")).status).toBe(204);
    expect(await json(await call(c, "/chat/invites"))).toEqual([]);
    // erneut einladen klappt (Unique-Index gilt nur für offene)
    expect((await json(await call(a, `/chat/groups/${g.id}/invites`, "POST", { userIds: [b.id, c.id] }))).invited.sort()).toEqual([b.id, c.id].sort());
    // Ablauf nach 7 Tagen
    await db.update(conversationInvites).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await json(await call(b, "/chat/invites"))).toEqual([]);
  });

  it("abgelaufene Einladungen lassen sich nicht annehmen (410) und die Frist beträgt 7 Tage", async () => {
    const a = await person("Anna"); const b = await person("Bernd");
    const g = await json(await call(a, "/chat/groups", "POST", { name: "G", userIds: [b.id] }));
    const [inv] = await db.select().from(conversationInvites);
    const days = (inv!.expiresAt.getTime() - inv!.createdAt.getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(6.99); expect(days).toBeLessThan(7.01);
    await db.update(conversationInvites).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await call(b, `/chat/invites/${inv!.id}/accept`, "POST")).status).toBe(410);
    expect((await call(b, `/chat/groups/${g.id}`)).status).toBe(404);
  });

  it("fremde Einladungen können weder angenommen noch abgelehnt werden", async () => {
    const a = await person("Anna"); const b = await person("Bernd"); const c = await person("Chris");
    await call(a, "/chat/groups", "POST", { name: "G", userIds: [b.id] });
    const [ib] = await json(await call(b, "/chat/invites"));
    expect((await call(c, `/chat/invites/${ib.id}/accept`, "POST")).status).toBe(404);
    expect((await call(c, `/chat/invites/${ib.id}/decline`, "POST")).status).toBe(404);
    expect((await call(c, `/chat/invites/not-a-uuid/accept`, "POST")).status).toBe(400);
  });

  it("zwei gleichzeitige Annahmen überschreiten die Obergrenze nicht", async () => {
    const a = await person("Anna");
    const many: Person[] = [];
    for (let i = 0; i < 19; i++) many.push(await person(`U${i}`));
    const g = await json(await call(a, "/chat/groups", "POST", { name: "Fast voll", userIds: many.slice(0, 18).map((u) => u.id) }));
    // 18 offene Einladungen + 1 Admin = 19; die 19. Person ist noch Platz 20. Danach Kapazität über Mitglieder erzwingen:
    const accepts = await Promise.all(many.slice(0, 18).map(async (u) => { const [i] = await json(await call(u, "/chat/invites")); return call(u, `/chat/invites/${i.id}/accept`, "POST"); }));
    expect(accepts.every((r) => r.status === 200)).toBe(true);
    const last = many[18]!;
    expect((await call(a, `/chat/groups/${g.id}/invites`, "POST", { userIds: [last.id] })).status).toBe(201);
    const count = await db.select().from(conversationMembers).where(eq(conversationMembers.conversationId, g.id));
    expect(count).toHaveLength(19);
  });

  it("begrenzt offene Einladungen je Person auf 20 (Rest wird übersprungen)", async () => {
    const a = await person("Anna"); const b = await person("Bernd"); const spammy = await person("Spam");
    for (let i = 0; i < 20; i++) {
      const [cv] = await db.insert(conversations).values({ name: `G${i}`, isGroup: true, createdBy: a.id }).returning();
      await db.insert(conversationInvites).values({ conversationId: cv!.id, inviterId: a.id, inviteeId: b.id, expiresAt: new Date(Date.now() + 86_400_000) });
    }
    const g = await json(await call(spammy, "/chat/groups", "POST", { name: "Noch eine", userIds: [a.id, b.id] }));
    expect(g.skipped).toEqual([{ userId: b.id, reason: "Hat zu viele offene Einladungen" }]);
  });
});

describe("Gruppen: Rollen, Mitglieder, Einstellungen", () => {
  it("nur Admins benennen um (mit Hinweiszeile) und stellen Avatar/Verlauf ein", async () => {
    const a = await person("Anna"); const b = await person("Bernd");
    const g = await group(a, [b]);
    expect((await call(b, `/chat/groups/${g.id}`, "PATCH", { name: "Hack" })).status).toBe(403);
    const res = await call(a, `/chat/groups/${g.id}`, "PATCH", { name: "Neue Runde", historyVisible: true, avatar: null });
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ name: "Neue Runde", historyVisible: true });
    expect((await msgs(b, g.id)).at(-1).text).toBe("Anna hat die Gruppe in „Neue Runde“ umbenannt");
    expect((await call(a, `/chat/groups/${g.id}`, "PATCH", {})).status).toBe(400);
    expect((await call(a, `/chat/groups/${g.id}`, "PATCH", { avatar: "javascript:alert(1)" })).status).toBe(400);
    expect((await call(a, `/chat/groups/${g.id}`, "PATCH", { avatar: "http://insecure.example/x.png" })).status).toBe(400);
    expect((await call(a, `/chat/groups/${g.id}`, "PATCH", { avatar: "/media/00000000-0000-4000-8000-000000000000" })).status).toBe(200);
  });

  it("nur Admins entfernen Mitglieder; Entfernte verlieren sofort den Zugriff", async () => {
    const a = await person("Anna"); const b = await person("Bernd"); const c = await person("Chris");
    const g = await group(a, [b, c]);
    expect((await call(b, `/chat/groups/${g.id}/members/${c.id}`, "DELETE")).status).toBe(403);
    expect((await call(a, `/chat/groups/${g.id}/members/${a.id}`, "DELETE")).status).toBe(400);
    expect((await call(a, `/chat/groups/${g.id}/members/${c.id}`, "DELETE")).status).toBe(204);
    expect((await call(c, `/chat/groups/${g.id}`)).status).toBe(404);
    expect((await send(c, g.id, "noch da?")).status).toBe(404);
    expect((await msgs(a, g.id)).at(-1).text).toBe("Chris wurde von Anna entfernt");
    expect((await call(a, `/chat/groups/${g.id}/members/${c.id}`, "DELETE")).status).toBe(404);
  });

  it("jeder darf gehen; ohne Admin wird das am längsten dabei seiende Mitglied Admin", async () => {
    const a = await person("Anna"); const b = await person("Bernd"); const c = await person("Chris");
    const g = await group(a, [b, c]);
    expect((await call(a, `/chat/groups/${g.id}/leave`, "POST")).status).toBe(204);
    const detail = await json(await call(b, `/chat/groups/${g.id}`));
    expect(detail.members.map((m: any) => [m.name, m.role])).toEqual([["Bernd", "admin"], ["Chris", "member"]]);
    expect((await msgs(b, g.id)).slice(-2).map((m) => m.text)).toEqual(["Anna hat die Gruppe verlassen", "Bernd ist jetzt Admin"]);
    // Mitglied geht, Admin bleibt Admin
    expect((await call(c, `/chat/groups/${g.id}/leave`, "POST")).status).toBe(204);
    expect((await json(await call(b, `/chat/groups/${g.id}`))).members).toHaveLength(1);
    // Letzter geht: Gruppe verschwindet samt Nachrichten
    expect((await call(b, `/chat/groups/${g.id}/leave`, "POST")).status).toBe(204);
    expect(await db.select().from(conversations).where(eq(conversations.id, g.id))).toHaveLength(0);
    expect(await db.select().from(messages).where(eq(messages.conversationId, g.id))).toHaveLength(0);
  });

  it("neue Mitglieder sehen ältere Nachrichten nur, wenn der Verlauf offen ist", async () => {
    const a = await person("Anna"); const b = await person("Bernd"); const c = await person("Chris");
    const g = await group(a, [b]);
    await send(a, g.id, "Geheimnis vor Chris");
    await call(a, `/chat/groups/${g.id}/invites`, "POST", { userIds: [c.id] });
    const [ic] = await json(await call(c, "/chat/invites"));
    await new Promise((r) => setTimeout(r, 20));
    await call(c, `/chat/invites/${ic.id}/accept`, "POST");
    await send(a, g.id, "Hallo Chris");
    expect((await msgs(c, g.id)).map((m) => m.text)).toEqual(["Chris ist der Gruppe beigetreten", "Hallo Chris"]);
    expect((await json(await call(c, "/chat"))).find((x: any) => x.id === g.id).last).toBe("Anna: Hallo Chris");
    await call(a, `/chat/groups/${g.id}`, "PATCH", { historyVisible: true });
    expect((await msgs(c, g.id)).map((m) => m.text)).toContain("Geheimnis vor Chris");
  });

  it("Direktnachrichten haben keine Gruppenfunktionen", async () => {
    const a = await person("Anna"); const b = await person("Bernd");
    const dm = await json(await call(a, "/chat", "POST", { userId: b.id }));
    expect(dm).toMatchObject({ isGroup: false, role: null });
    expect((await call(a, `/chat/groups/${dm.id}`)).status).toBe(404);
    expect((await call(a, `/chat/groups/${dm.id}/leave`, "POST")).status).toBe(404);
    expect((await send(a, dm.id, "Hi")).status).toBe(201);
    expect(await msgs(b, dm.id)).toMatchObject([{ text: "Hi", from: "them", senderName: "Anna", kind: "user", topicId: null }]);
  });
});

describe("Gruppen: Themen", () => {
  it("Admins legen Themen an, benennen um, heften an und löschen – „Allgemein“ bleibt", async () => {
    const a = await person("Anna"); const b = await person("Bernd");
    const g = await group(a, [b]);
    expect((await call(b, `/chat/groups/${g.id}/topics`, "POST", { name: "Dünger" })).status).toBe(403);
    expect((await call(a, `/chat/groups/${g.id}/topics`, "POST", { name: "" })).status).toBe(400);
    expect((await call(a, `/chat/groups/${g.id}/topics`, "POST", { name: "x".repeat(41) })).status).toBe(400);
    const made = await json(await call(a, `/chat/groups/${g.id}/topics`, "POST", { name: "Dünger", emoji: "🌱" }));
    const t = made.topics.find((x: any) => x.name === "Dünger");
    expect(t).toMatchObject({ emoji: "🌱", private: false, closed: false, pinned: false, isDefault: false });
    expect((await msgs(b, g.id)).at(-1).text).toBe("Anna hat das Thema „🌱 Dünger“ erstellt");
    const renamed = await json(await call(a, `/chat/groups/${g.id}/topics/${t.id}`, "PATCH", { name: "Nährstoffe", pinned: true }));
    expect(renamed.topics[0]).toMatchObject({ name: "Nährstoffe", pinned: true }); // angeheftet zuerst
    const def = renamed.topics.find((x: any) => x.isDefault);
    expect((await call(a, `/chat/groups/${g.id}/topics/${def.id}`, "DELETE")).status).toBe(400);
    expect((await call(b, `/chat/groups/${g.id}/topics/${t.id}`, "DELETE")).status).toBe(403);
    await send(b, g.id, "weg damit", t.id);
    expect((await call(a, `/chat/groups/${g.id}/topics/${t.id}`, "DELETE")).status).toBe(204);
    expect((await topicsOf(a, g.id)).map((x) => x.name)).toEqual(["Allgemein"]);
    expect((await call(b, `/chat/${g.id}/messages?topicId=${t.id}`)).status).toBe(404);
  });

  it("Nachrichten gehören zu ihrem Thema; ohne Angabe gilt „Allgemein“", async () => {
    const a = await person("Anna"); const b = await person("Bernd");
    const g = await group(a, [b]);
    const made = await json(await call(a, `/chat/groups/${g.id}/topics`, "POST", { name: "Technik" }));
    const tech = made.topics.find((x: any) => x.name === "Technik");
    await send(a, g.id, "im Standardthema");
    await send(b, g.id, "zur Technik", tech.id);
    expect((await msgs(a, g.id)).map((m) => m.text)).toContain("im Standardthema");
    expect((await msgs(a, g.id)).map((m) => m.text)).not.toContain("zur Technik");
    expect(await msgs(a, g.id, tech.id)).toMatchObject([{ text: "zur Technik", senderName: "Bernd", kind: "user", from: "them" }]);
    expect((await send(a, g.id, "x", "00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });

  it("geschlossene und „nur Admins“-Themen sperren das Schreiben für Mitglieder", async () => {
    const a = await person("Anna"); const b = await person("Bernd");
    const g = await group(a, [b]);
    const ann = (await json(await call(a, `/chat/groups/${g.id}/topics`, "POST", { name: "Ankündigungen", adminsOnly: true }))).topics.find((x: any) => x.name === "Ankündigungen");
    expect(ann.canWrite).toBe(true);
    expect((await topicsOf(b, g.id)).find((x) => x.id === ann.id).canWrite).toBe(false);
    expect((await send(b, g.id, "Hi", ann.id)).status).toBe(403);
    expect((await send(a, g.id, "Wichtig", ann.id)).status).toBe(201);
    // schließen/öffnen
    const def = (await topicsOf(a, g.id)).find((x) => x.isDefault);
    await call(a, `/chat/groups/${g.id}/topics/${def.id}`, "PATCH", { closed: true });
    const closed = await send(b, g.id, "Hallo?");
    expect(closed.status).toBe(403);
    expect((await json(closed)).error).toMatch(/geschlossen/);
    expect((await send(a, g.id, "Admin darf")).status).toBe(201);
    expect((await msgs(b, g.id)).some((m) => m.text.includes("geschlossen"))).toBe(true);
    await call(a, `/chat/groups/${g.id}/topics/${def.id}`, "PATCH", { closed: false });
    expect((await send(b, g.id, "wieder da")).status).toBe(201);
  });

  it("private Themen sehen nur ihre Mitglieder und Admins (Liste, Nachrichten, Zähler)", async () => {
    const a = await person("Anna"); const b = await person("Bernd"); const c = await person("Chris");
    const g = await group(a, [b, c]);
    expect((await call(a, `/chat/groups/${g.id}/topics`, "POST", { name: "Geheim", private: true, userIds: [b.id, "00000000-0000-4000-8000-000000000000"] })).status).toBe(400);
    const made = await json(await call(a, `/chat/groups/${g.id}/topics`, "POST", { name: "Geheim", private: true, userIds: [b.id] }));
    const t = made.topics.find((x: any) => x.name === "Geheim");
    expect(t.memberIds.sort()).toEqual([a.id, b.id].sort());
    expect((await topicsOf(b, g.id)).map((x) => x.name)).toContain("Geheim");
    expect((await topicsOf(c, g.id)).map((x) => x.name)).not.toContain("Geheim");
    expect((await topicsOf(b, g.id)).find((x) => x.name === "Geheim").memberIds).toBeUndefined();
    expect((await send(b, g.id, "unter uns", t.id)).status).toBe(201);
    expect((await send(c, g.id, "ich auch", t.id)).status).toBe(404);
    expect((await call(c, `/chat/${g.id}/messages?topicId=${t.id}`)).status).toBe(404);
    // Zähler und „Zuletzt“ verraten nichts
    expect((await topicsOf(a, g.id)).find((x) => x.name === "Geheim").unread).toBe(1);
    const listC = (await json(await call(c, "/chat"))).find((x: any) => x.id === g.id);
    expect(listC.last).not.toMatch(/unter uns/);
    expect(listC.unread).toBe(0);
    // Mitglieder des Themas ändern (nur Gruppenmitglieder, nur private Themen)
    const put = await call(a, `/chat/groups/${g.id}/topics/${t.id}/members`, "PUT", { userIds: [c.id] });
    expect(put.status).toBe(200);
    expect((await send(c, g.id, "jetzt ja", t.id)).status).toBe(201);
    expect((await send(b, g.id, "jetzt nicht", t.id)).status).toBe(404);
    const pub = (await topicsOf(a, g.id)).find((x) => x.isDefault);
    expect((await call(a, `/chat/groups/${g.id}/topics/${pub.id}/members`, "PUT", { userIds: [b.id] })).status).toBe(400);
  });

  it("Reihenfolge: verschieben tauscht mit dem Nachbarn, angeheftete bleiben oben", async () => {
    const a = await person("Anna"); const b = await person("Bernd");
    const g = await group(a, [b]);
    for (const name of ["Eins", "Zwei", "Drei"]) await call(a, `/chat/groups/${g.id}/topics`, "POST", { name });
    let topics = await topicsOf(a, g.id);
    expect(topics.map((t) => t.name)).toEqual(["Allgemein", "Eins", "Zwei", "Drei"]);
    const drei = topics.find((t) => t.name === "Drei");
    topics = (await json(await call(a, `/chat/groups/${g.id}/topics/${drei.id}/move`, "POST", { direction: "up" }))).topics;
    expect(topics.map((t) => t.name)).toEqual(["Allgemein", "Eins", "Drei", "Zwei"]);
    await call(a, `/chat/groups/${g.id}/topics/${drei.id}/move`, "POST", { direction: "up" });
    topics = (await json(await call(a, `/chat/groups/${g.id}/topics/${drei.id}/move`, "POST", { direction: "up" }))).topics;
    expect(topics.map((t) => t.name)).toEqual(["Drei", "Allgemein", "Eins", "Zwei"]);
    const zwei = topics.find((t) => t.name === "Zwei");
    topics = (await json(await call(a, `/chat/groups/${g.id}/topics/${zwei.id}`, "PATCH", { pinned: true }))).topics;
    expect(topics.map((t) => t.name)).toEqual(["Zwei", "Drei", "Allgemein", "Eins"]);
    // über die Grenze angeheftet/nicht angeheftet wird nicht verschoben
    topics = (await json(await call(a, `/chat/groups/${g.id}/topics/${drei.id}/move`, "POST", { direction: "up" }))).topics;
    expect(topics.map((t) => t.name)).toEqual(["Zwei", "Drei", "Allgemein", "Eins"]);
    expect((await call(b, `/chat/groups/${g.id}/topics/${drei.id}/move`, "POST", { direction: "up" })).status).toBe(403);
    expect((await call(a, `/chat/groups/${g.id}/topics/${drei.id}/move`, "POST", { direction: "sideways" })).status).toBe(400);
  });

  it("höchstens 50 Themen je Gruppe", async () => {
    const a = await person("Anna"); const b = await person("Bernd");
    const g = await group(a, [b]);
    for (let i = 0; i < 49; i++) await db.execute(sql`INSERT INTO conversation_topics (conversation_id, name, position) VALUES (${g.id}, ${`T${i}`}, ${i + 1})`);
    expect((await call(a, `/chat/groups/${g.id}/topics`, "POST", { name: "Zu viel" })).status).toBe(409);
  });
});

describe("Gruppen: Ungelesen und Stummschalten", () => {
  it("zählt je Thema, ignoriert eigene Nachrichten und Hinweiszeilen, und Lesen setzt zurück", async () => {
    const a = await person("Anna"); const b = await person("Bernd");
    const g = await group(a, [b]);
    const tech = (await json(await call(a, `/chat/groups/${g.id}/topics`, "POST", { name: "Technik" }))).topics.find((x: any) => x.name === "Technik");
    expect((await json(await call(b, "/chat/unread"))).total).toBe(0); // nur Hinweiszeilen
    await send(a, g.id, "eins"); await send(a, g.id, "zwei", tech.id); await send(a, g.id, "drei", tech.id);
    const own = (await json(await call(a, `/chat/groups/${g.id}/topics`, "POST", { name: "Eigen" }))).topics.find((x: any) => x.name === "Eigen");
    await send(a, g.id, "fremd", own.id);
    await send(b, g.id, "eigene zählt nicht", own.id); // wer schreibt, hat das Thema gelesen
    const topics = await topicsOf(b, g.id);
    expect(topics.find((t) => t.isDefault).unread).toBe(1);
    expect(topics.find((t) => t.name === "Technik").unread).toBe(2);
    expect(topics.find((t) => t.name === "Eigen").unread).toBe(0);
    expect((await json(await call(b, "/chat/unread"))).total).toBe(3);
    expect((await json(await call(b, "/chat"))).find((x: any) => x.id === g.id).unread).toBe(3);
    expect((await call(b, `/chat/${g.id}/read`, "POST", { topicId: tech.id })).status).toBe(204);
    expect((await json(await call(b, "/chat/unread"))).total).toBe(1);
    expect((await call(b, `/chat/${g.id}/read`, "POST")).status).toBe(204); // alle Themen
    expect((await json(await call(b, "/chat/unread"))).total).toBe(0);
  });

  it("stumm geschaltete Themen zählen im Thema, aber nicht in Liste/Summe und lösen keinen Push aus", async () => {
    const a = await person("Anna"); const b = await person("Bernd"); const c = await person("Chris");
    const g = await group(a, [b, c]);
    for (const p of [b, c]) await db.insert(pushSubscriptions).values({ userId: p.id, endpoint: `https://fcm.googleapis.com/fcm/send/${p.name}`, p256dh: "x", auth: "y" });
    const def = (await topicsOf(b, g.id)).find((t) => t.isDefault);
    expect((await call(b, `/chat/groups/${g.id}/topics/${def.id}/me`, "PUT", { muted: true })).status).toBe(204);
    expect((await call(b, `/chat/groups/${g.id}/topics/${def.id}/me`, "PUT", { muted: "ja" })).status).toBe(400);
    await send(a, g.id, "Hallo zusammen");
    await settle();
    const t = (await topicsOf(b, g.id)).find((x) => x.isDefault);
    expect(t).toMatchObject({ muted: true, unread: 1 });
    expect((await json(await call(b, "/chat/unread"))).total).toBe(0);
    expect((await json(await call(b, "/chat"))).find((x: any) => x.id === g.id).unread).toBe(0);
    expect((await json(await call(c, "/chat/unread"))).total).toBe(1);
    expect(sent.map((s) => s.endpoint)).toEqual([`https://fcm.googleapis.com/fcm/send/Chris`]);
  });

  it("Gruppen-Push: Titel = Gruppenname, „Absender: Text“ (mit Vorschau), Tag je Thema; Hinweiszeilen lösen keinen Push aus", async () => {
    const a = await person("Anna"); const b = await person("Bernd");
    const g = await group(a, [b]);
    await db.insert(pushSubscriptions).values({ userId: b.id, endpoint: "https://fcm.googleapis.com/fcm/send/b", p256dh: "x", auth: "y" });
    await db.execute(sql`INSERT INTO push_prefs (user_id, show_preview) VALUES (${b.id}, true)`);
    await settle(); sent.length = 0; // Einladungs-/Beitrittshinweise nicht mitzählen
    await call(a, `/chat/groups/${g.id}`, "PATCH", { name: "Neuer Name" });
    await settle();
    expect(sent).toHaveLength(0);
    await send(a, g.id, "Gießplan steht");
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.payload).toMatchObject({ title: "Neuer Name", body: "Anna: Gießplan steht" });
    expect(sent[0]!.payload.tag).toMatch(/^go-chat-[0-9a-f]{8}-[0-9a-f]{8}$/);
  });

  it("Einladung löst eine In-App-Benachrichtigung aus und (bei Abo) einen Push in der Kategorie „Nachrichten“", async () => {
    const a = await person("Anna"); const b = await person("Bernd");
    await db.insert(pushSubscriptions).values({ userId: b.id, endpoint: "https://fcm.googleapis.com/fcm/send/b", p256dh: "x", auth: "y" });
    await db.execute(sql`INSERT INTO push_prefs (user_id, messages, other, show_preview) VALUES (${b.id}, true, false, true)`);
    await call(a, "/chat/groups", "POST", { name: "Growfreunde", userIds: [b.id] });
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.payload).toMatchObject({ category: "messages", title: "Einladung zur Gruppe „Growfreunde“", url: "/chat" });
  });
});

describe("Gruppen: Echtzeit-Zielgruppen", () => {
  it("typing mit Themen-ID gilt nur für berechtigte Personen", async () => {
    const { announceTyping } = await import("../src/realtime/commands.ts");
    const a = await person("Anna"); const b = await person("Bernd");
    const g = await group(a, [b]);
    const def = (await topicsOf(a, g.id)).find((t) => t.isDefault);
    expect(await announceTyping(a.id, g.id, def.id)).toBe(true);
    resetTypingThrottle();
    expect(await announceTyping(a.id, g.id, "00000000-0000-4000-8000-000000000000")).toBe(false);
    resetTypingThrottle();
    const priv = (await json(await call(a, `/chat/groups/${g.id}/topics`, "POST", { name: "P", private: true, userIds: [] }))).topics.find((t: any) => t.name === "P");
    expect(await announceTyping(b.id, g.id, priv.id)).toBe(false);
  });
});

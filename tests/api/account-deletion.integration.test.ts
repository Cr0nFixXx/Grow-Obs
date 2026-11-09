import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { unzipSync, strFromU8 } from "fflate";
import { app } from "../../apps/api/src/app.ts";
import { client, db } from "../../apps/api/src/db/client.ts";
import {
  comments, communities, communityMembers, conversationMembers, conversations, growEnv, growLogs, grows, itemComments, media, messages, notifications,
  postLikes, posts, sessions, subs, threads, users,
} from "../../apps/api/src/db/schema.ts";
import { signToken } from "../../apps/api/src/lib/jwt.ts";
import { hashPassword } from "../../apps/api/src/lib/password.ts";
import { SESSION_COOKIE } from "../../apps/api/src/lib/session.ts";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.ts";

const PASSWORD = "test-password-long-enough";
const ALL_DELETE = { forum: "delete", feed: "delete", comments: "delete", chat: "delete", media: "remove" } as const;
const ALL_KEEP = { forum: "keep", feed: "keep", comments: "keep", chat: "keep", media: "keep" } as const;

type Person = { id: string; token: string; email: string };
const cookie = (p: Person) => `${SESSION_COOKIE}=${p.token}`;
function call(p: Person | null, path: string, method = "GET", data?: unknown) {
  return app.request(path, {
    method,
    headers: { ...(p ? { Cookie: cookie(p) } : {}), ...(data === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
const json = async <T = any>(res: Response) => (await res.json()) as T;
const del = (p: Person, extra: Record<string, unknown> = {}) =>
  call(p, "/auth/account", "DELETE", { password: PASSWORD, confirm: "LÖSCHEN", options: ALL_DELETE, ...extra });

async function person(name: string, role: "member" | "platform_admin" = "member"): Promise<Person> {
  const id = randomUUID();
  const email = `${name}@example.test`;
  await db.insert(users).values({ id, email, name, handle: name, passwordHash: await hashPassword(PASSWORD), role });
  const expiresAt = new Date(Date.now() + 3_600_000);
  const [s] = await db.insert(sessions).values({ userId: id, expiresAt }).returning({ id: sessions.id });
  return { id, email, token: await signToken({ sub: id, role, sid: s!.id }, expiresAt) };
}
async function uploadRow(owner: Person, name = "bild.png") {
  const [m] = await db.insert(media).values({ ownerId: owner.id, contentType: "image/png", size: 4, data: Buffer.from([1, 2, 3, 4]), fileName: name }).returning({ id: media.id });
  return m!.id;
}
const userRow = async (id: string) => (await db.select().from(users).where(eq(users.id, id)))[0];

beforeAll(async () => {
  const name = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  if (process.env.NODE_ENV !== "test" || !name.endsWith("_test")) throw new Error("Integration tests require a dedicated *_test database");
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../apps/api/drizzle", import.meta.url)) });
});
beforeEach(async () => {
  await resetRateLimits();
  await db.execute(sql`TRUNCATE TABLE users, communities, conversations, subs CASCADE`);
});
afterAll(async () => { await client.end({ timeout: 5 }); });

describe("Konto löschen: Schutz", () => {
  it("braucht Anmeldung, Passwort und das Wort LÖSCHEN", async () => {
    const anna = await person("anna");
    expect((await call(null, "/auth/account", "DELETE", { password: PASSWORD, confirm: "LÖSCHEN", options: ALL_DELETE })).status).toBe(401);
    expect((await del(anna, { password: "falsches-passwort-123" })).status).toBe(403);
    expect((await del(anna, { confirm: "ja" })).status).toBe(400);
    expect((await del(anna, { options: { forum: "delete" } })).status).toBe(400);
    expect((await userRow(anna.id))?.deletedAt).toBeNull();
  });

  it("der letzte Plattform-Admin bleibt; mit einem zweiten Admin geht es", async () => {
    const root = await person("root", "platform_admin");
    const res = await del(root);
    expect(res.status).toBe(409);
    expect((await json(res)).platformAdmin).toBe(true);
    await person("root2", "platform_admin");
    expect((await del(root)).status).toBe(200);
  });

  it("alleiniger Admin einer Gruppe oder Community mit weiteren Mitgliedern muss erst übergeben", async () => {
    const anna = await person("anna"); const ben = await person("ben");
    const [cv] = await db.insert(conversations).values({ name: "Beet-Team", isGroup: true, createdBy: anna.id }).returning();
    await db.insert(conversationMembers).values([{ conversationId: cv!.id, userId: anna.id, role: "admin" }, { conversationId: cv!.id, userId: ben.id, role: "member" }]);
    const [co] = await db.insert(communities).values({ name: "Living Soil", description: "", createdBy: anna.id }).returning();
    await db.insert(communityMembers).values([{ communityId: co!.id, userId: anna.id, role: "admin" }, { communityId: co!.id, userId: ben.id, role: "member" }]);

    const check = await json(await call(anna, "/auth/account/check"));
    expect(check.blocked).toBe(true);
    expect(check.groups).toEqual([{ id: cv!.id, name: "Beet-Team" }]);
    expect(check.communities).toEqual([{ id: co!.id, name: "Living Soil" }]);
    const res = await del(anna);
    expect(res.status).toBe(409);
    expect((await json(res)).code).toBe("account_blocked");

    // Ben wird Admin der Gruppe und der Community → frei
    await db.update(conversationMembers).set({ role: "admin" }).where(eq(conversationMembers.userId, ben.id));
    await db.update(communityMembers).set({ role: "admin" }).where(eq(communityMembers.userId, ben.id));
    expect((await json(await call(anna, "/auth/account/check"))).blocked).toBe(false);
    expect((await del(anna)).status).toBe(200);
  });

  it("allein in einer Gruppe: die Gruppe verschwindet mit dem Konto", async () => {
    const anna = await person("anna");
    const [cv] = await db.insert(conversations).values({ name: "Solo", isGroup: true, createdBy: anna.id }).returning();
    await db.insert(conversationMembers).values({ conversationId: cv!.id, userId: anna.id, role: "admin" });
    expect((await del(anna)).status).toBe(200);
    expect(await db.select().from(conversations).where(eq(conversations.id, cv!.id))).toHaveLength(0);
  });
});

describe("Konto löschen: alles löschen", () => {
  it("entfernt Persönliches sofort, lässt Gespräche anderer heil und anonymisiert die Hülle", async () => {
    const anna = await person("anna"); const ben = await person("ben");
    // Grow mit Inhalt, Aufgaben-ähnliches Persönliches, Benachrichtigung
    const [g] = await db.insert(grows).values({ userId: anna.id, name: "Cherry", startDate: "2026-09-01" }).returning();
    await db.insert(growLogs).values({ growId: g!.id, day: 1, title: "t", body: "b" });
    await db.insert(growEnv).values({ growId: g!.id, day: 1, loggedOn: "2026-09-02", temp: 24 });
    await db.insert(notifications).values({ userId: anna.id, type: "system", title: "x", body: "y" });
    // Feed: ein Beitrag ohne, einer mit Kommentar eines anderen; Kommentar von Anna an Bens Beitrag
    const [p1] = await db.insert(posts).values({ userId: anna.id, text: "allein" }).returning();
    const imageId = await uploadRow(anna);
    const [p2] = await db.insert(posts).values({ userId: anna.id, text: "mit Antwort", imageUrl: `/media/${imageId}` }).returning();
    await db.insert(itemComments).values({ kind: "post", itemId: p2!.id, userId: ben.id, body: "Hi Anna" });
    const [p3] = await db.insert(posts).values({ userId: ben.id, text: "von Ben" }).returning();
    await db.insert(itemComments).values({ kind: "post", itemId: p3!.id, userId: anna.id, body: "Annas Kommentar" });
    await db.insert(postLikes).values({ postId: p3!.id, userId: anna.id });
    // Forum: Thread ohne Antwort, Thread mit Antwort von Ben, Annas Antwort mit/ohne Folgeantwort
    const [sub] = await db.insert(subs).values({ name: "r/test" }).returning();
    const [t1] = await db.insert(threads).values({ subId: sub!.id, userId: anna.id, title: "leer", body: "x" }).returning();
    const [t2] = await db.insert(threads).values({ subId: sub!.id, userId: anna.id, title: "mit Antwort", body: "Text" }).returning();
    const [c1] = await db.insert(comments).values({ threadId: t2!.id, userId: ben.id, body: "Bens Antwort" }).returning();
    const [t3] = await db.insert(threads).values({ subId: sub!.id, userId: ben.id, title: "Bens Thread", body: "b" }).returning();
    const [ca] = await db.insert(comments).values({ threadId: t3!.id, userId: anna.id, body: "Anna 1" }).returning();
    await db.insert(comments).values({ threadId: t3!.id, userId: ben.id, parentId: ca!.id, body: "Ben antwortet Anna" });
    await db.insert(comments).values({ threadId: t3!.id, userId: anna.id, body: "Anna ohne Antwort" });
    // Chat: Direktchat mit Ben, Gruppe mit Ben als weiterem Admin
    const [dm] = await db.insert(conversations).values({ name: "", isGroup: false, createdBy: anna.id, directKey: [anna.id, ben.id].sort().join(":") }).returning();
    await db.insert(conversationMembers).values([{ conversationId: dm!.id, userId: anna.id }, { conversationId: dm!.id, userId: ben.id }]);
    await db.insert(messages).values([{ conversationId: dm!.id, senderId: anna.id, text: "geheim" }, { conversationId: dm!.id, senderId: ben.id, text: "hallo" }]);
    const [grp] = await db.insert(conversations).values({ name: "Team", isGroup: true, createdBy: anna.id }).returning();
    await db.insert(conversationMembers).values([{ conversationId: grp!.id, userId: anna.id, role: "member" }, { conversationId: grp!.id, userId: ben.id, role: "admin" }]);

    const res = await del(anna);
    expect(res.status).toBe(200);
    expect((await json(res)).mode).toBe("anonymized");
    expect(res.headers.getSetCookie().join(";")).toMatch(new RegExp(`${SESSION_COOKIE}=;|${SESSION_COOKIE}=; `));

    const row = (await userRow(anna.id))!;
    expect(row.name).toBe("Gelöschtes Mitglied");
    expect(row.handle).toMatch(/^geloescht_/);
    expect(row.email).toMatch(/@geloescht\.invalid$/);
    expect(row.deletedAt).not.toBeNull();
    expect(row.passwordHash).toBe("!geloescht");
    // Persönliches weg
    expect(await db.select().from(grows).where(eq(grows.userId, anna.id))).toHaveLength(0);
    expect(await db.select().from(growLogs).where(eq(growLogs.growId, g!.id))).toHaveLength(0);
    expect(await db.select().from(notifications).where(eq(notifications.userId, anna.id))).toHaveLength(0);
    expect(await db.select().from(sessions).where(eq(sessions.userId, anna.id))).toHaveLength(0);
    expect(await db.select().from(postLikes).where(eq(postLikes.userId, anna.id))).toHaveLength(0);
    expect(await db.select().from(media).where(eq(media.id, imageId))).toHaveLength(0);
    // Feed
    expect(await db.select().from(posts).where(eq(posts.id, p1!.id))).toHaveLength(0);
    const hull = (await db.select().from(posts).where(eq(posts.id, p2!.id)))[0]!;
    expect(hull.text).toBe("[gelöscht]"); expect(hull.imageUrl).toBeNull();
    expect(await db.select().from(itemComments).where(eq(itemComments.itemId, p3!.id))).toHaveLength(0);
    expect(await db.select().from(posts).where(eq(posts.id, p3!.id))).toHaveLength(1);
    // Forum
    expect(await db.select().from(threads).where(eq(threads.id, t1!.id))).toHaveLength(0);
    expect((await db.select().from(threads).where(eq(threads.id, t2!.id)))[0]!.title).toBe("[gelöscht]");
    expect((await db.select().from(comments).where(eq(comments.id, c1!.id)))[0]!.body).toBe("Bens Antwort");
    const rest = await db.select().from(comments).where(eq(comments.threadId, t3!.id));
    expect(rest.map((r) => r.body).sort()).toEqual(["Anna 1".replace("Anna 1", "[gelöscht]"), "Ben antwortet Anna"].sort());
    // Chat: Direktchat bleibt, Annas Nachricht ist ein Platzhalter; Gruppe verlassen, Ben bleibt Admin
    const dmMsgs = await db.select().from(messages).where(eq(messages.conversationId, dm!.id));
    expect(dmMsgs.find((m) => m.senderId === anna.id)).toMatchObject({ text: "", deletedAt: expect.any(Date) });
    expect(dmMsgs.find((m) => m.senderId === ben.id)?.text).toBe("hallo");
    const members = await db.select().from(conversationMembers).where(eq(conversationMembers.conversationId, grp!.id));
    expect(members.map((m) => m.userId)).toEqual([ben.id]);
    // Anmelden ist nicht mehr möglich, auch der alte Cookie nicht
    expect((await call(anna, "/auth/me")).status).toBe(401);
    expect((await call(null, "/auth/login", "POST", { email: anna.email, password: PASSWORD })).status).toBe(401);
    // Ben sieht die Hülle nirgends: nicht in der Suche, kein Profil, kein neuer Direktchat, Schreiben gesperrt
    expect(await json(await call(ben, "/chat/users?q=anna"))).toEqual([]);
    expect(await json(await call(ben, "/chat/users?q=gel%C3%B6scht"))).toEqual([]);
    expect((await call(ben, `/chat/${dm!.id}/messages`, "POST", { text: "noch da?" })).status).toBe(409);
    expect((await call(ben, "/chat", "POST", { userId: anna.id })).status).toBe(404);
  });

  it("ohne Spuren (nichts hängt mehr an der Zeile) wird das Konto ganz entfernt", async () => {
    const anna = await person("anna");
    await db.insert(grows).values({ userId: anna.id, name: "Cherry", startDate: "2026-09-01" });
    const res = await del(anna);
    expect((await json(res)).mode).toBe("removed");
    expect(await userRow(anna.id)).toBeUndefined();
  });

  it("Admin-Liste und Statistik zählen gelöschte Konten nicht", async () => {
    const root = await person("root", "platform_admin"); const anna = await person("anna");
    expect((await json(await call(root, "/admin/stats"))).users).toBe(2);
    await db.insert(messages).values({ conversationId: (await db.insert(conversations).values({ name: "", isGroup: false }).returning())[0]!.id, senderId: anna.id, text: "x" });
    expect((await json(await del(anna))).mode).toBe("anonymized");
    expect((await json(await call(root, "/admin/stats"))).users).toBe(1);
    expect((await json(await call(root, "/admin/users"))).map((u: any) => u.handle)).toEqual(["root"]);
  });
});

describe("Konto löschen: Inhalte behalten", () => {
  it("Beiträge, Forum und Chat bleiben unter „Gelöschtes Mitglied“ stehen; Bilder entfernen oder behalten", async () => {
    const anna = await person("anna"); const ben = await person("ben");
    const imageId = await uploadRow(anna);
    const [p] = await db.insert(posts).values({ userId: anna.id, text: "bleibt", imageUrl: `/media/${imageId}` }).returning();
    await db.insert(itemComments).values({ kind: "post", itemId: p!.id, userId: anna.id, body: "bleibt auch" });
    const [sub] = await db.insert(subs).values({ name: "r/test" }).returning();
    const [t] = await db.insert(threads).values({ subId: sub!.id, userId: anna.id, title: "Thread", body: "Text" }).returning();
    const [dm] = await db.insert(conversations).values({ name: "", isGroup: false, directKey: [anna.id, ben.id].sort().join(":") }).returning();
    await db.insert(conversationMembers).values([{ conversationId: dm!.id, userId: anna.id }, { conversationId: dm!.id, userId: ben.id }]);
    await db.insert(messages).values([
      { conversationId: dm!.id, senderId: anna.id, text: "Hallo Ben" },
      { conversationId: dm!.id, senderId: anna.id, text: "", imageUrl: `/media/${imageId}`, attachments: [{ path: `/media/${imageId}`, kind: "image", name: "bild.png", size: 4, mime: "image/png" }] },
    ]);

    // Bilder behalten: Beitrag und Anhang bleiben samt Datei erhalten
    expect((await json(await del(anna, { options: { ...ALL_KEEP, media: "keep" } }))).mode).toBe("anonymized");
    expect((await db.select().from(posts).where(eq(posts.id, p!.id)))[0]).toMatchObject({ text: "bleibt", imageUrl: `/media/${imageId}` });
    expect(await db.select().from(media).where(eq(media.id, imageId))).toHaveLength(1);
    expect(await db.select().from(itemComments).where(eq(itemComments.itemId, p!.id))).toHaveLength(1);
    expect((await db.select().from(threads).where(eq(threads.id, t!.id)))[0]!.title).toBe("Thread");
    const kept = await db.select().from(messages).where(eq(messages.conversationId, dm!.id));
    expect(kept.map((m) => m.text).sort()).toEqual(["", "Hallo Ben"]);
    // Der Verlauf nennt die Hülle beim Gegenüber
    const list = await json<any[]>(await call(ben, `/chat/${dm!.id}/messages`));
    expect(list.length).toBe(2);
  });

  it("Bilder entfernen: Text bleibt, Beitragsbild und Anhänge sind weg, die Dateien sofort gelöscht", async () => {
    const anna = await person("anna"); const ben = await person("ben");
    const imageId = await uploadRow(anna); const fileId = await uploadRow(anna, "plan.pdf");
    const [p] = await db.insert(posts).values({ userId: anna.id, text: "bleibt", imageUrl: `/media/${imageId}` }).returning();
    const [dm] = await db.insert(conversations).values({ name: "", isGroup: false, directKey: [anna.id, ben.id].sort().join(":") }).returning();
    await db.insert(conversationMembers).values([{ conversationId: dm!.id, userId: anna.id }, { conversationId: dm!.id, userId: ben.id }]);
    await db.insert(messages).values([
      { conversationId: dm!.id, senderId: anna.id, text: "mit Text", attachments: [{ path: `/media/${fileId}`, kind: "file", name: "plan.pdf", size: 4, mime: "application/pdf" }] },
      { conversationId: dm!.id, senderId: anna.id, text: "", imageUrl: `/media/${imageId}`, attachments: [{ path: `/media/${imageId}`, kind: "image", name: "b.png", size: 4, mime: "image/png" }] },
    ]);
    const res = await del(anna, { options: { ...ALL_KEEP, media: "remove" } });
    expect((await json(res)).mediaDeleted).toBe(2);
    expect((await db.select().from(posts).where(eq(posts.id, p!.id)))[0]).toMatchObject({ text: "bleibt", imageUrl: null });
    const rows = await db.select().from(messages).where(eq(messages.conversationId, dm!.id));
    const withText = rows.find((m) => m.text === "mit Text")!;
    expect(withText.attachments).toEqual([]);
    expect(rows.find((m) => m.text === "" )?.deletedAt).not.toBeNull();
    expect(await db.select().from(media).where(eq(media.ownerId, anna.id))).toHaveLength(0);
  });
});

describe("Datenexport", () => {
  async function download(p: Person) {
    const ticket = await call(p, "/auth/export", "POST", { password: PASSWORD });
    expect(ticket.status).toBe(200);
    const { path } = await json<{ path: string }>(ticket);
    return call(p, path);
  }

  it("verlangt das Passwort und liefert ein ZIP mit daten.json und den Dateien – ohne Geheimnisse", async () => {
    const anna = await person("anna");
    expect((await call(anna, "/auth/export", "POST", { password: "falsch-falsch-falsch" })).status).toBe(403);
    expect((await call(null, "/auth/export", "POST", { password: PASSWORD })).status).toBe(401);
    const imageId = await uploadRow(anna, "Mein Bild.png");
    const [g] = await db.insert(grows).values({ userId: anna.id, name: "Cherry Run", startDate: "2026-09-01" }).returning();
    await db.insert(growLogs).values({ growId: g!.id, day: 3, title: "Gegossen", body: "1 l" });
    await db.insert(posts).values({ userId: anna.id, text: "Mein Beitrag" });
    await db.insert(notifications).values({ userId: anna.id, type: "system", title: "Willkommen", body: "Hallo" });

    const res = await download(anna);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="grow-observer-daten-\d{4}-\d{2}-\d{2}\.zip"/);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(["daten.json", `medien/${imageId}.png`]);
    expect([...files[`medien/${imageId}.png`]!]).toEqual([1, 2, 3, 4]);
    const text = strFromU8(files["daten.json"]!);
    const data = JSON.parse(text);
    expect(data.konto).toMatchObject({ email: "anna@example.test", name: "anna" });
    expect(data.grows[0]).toMatchObject({ name: "Cherry Run" });
    expect(data.grows[0].logs[0].title).toBe("Gegossen");
    expect(data.feedBeitraege[0].text).toBe("Mein Beitrag");
    expect(data.benachrichtigungen[0].title).toBe("Willkommen");
    expect(data.dateien[0]).toMatchObject({ id: imageId, name: "Mein Bild.png", imZip: `medien/${imageId}.png` });
    expect(text).not.toContain("passwordHash");
    expect(text).not.toContain("argon2");
  });

  it("der Link gehört zu Konto und Sitzung, gilt kurz und lässt sich nicht fremd verwenden", async () => {
    const anna = await person("anna"); const ben = await person("ben");
    const { path } = await json<{ path: string }>(await call(anna, "/auth/export", "POST", { password: PASSWORD }));
    expect((await call(ben, path)).status).toBe(410);
    expect((await call(null, path)).status).toBe(401);
    expect((await call(anna, "/auth/export/download?ticket=kaputt")).status).toBe(410);
    expect((await call(anna, path)).status).toBe(200);
  });

  it("höchstens drei Exporte pro Stunde", async () => {
    const anna = await person("anna");
    for (let i = 0; i < 3; i += 1) expect((await call(anna, "/auth/export", "POST", { password: PASSWORD })).status).toBe(200);
    expect((await call(anna, "/auth/export", "POST", { password: PASSWORD })).status).toBe(429);
  });
});

describe("Migration 0025: users.deleted_at", () => {
  it("ist wiederholbar und lässt bestehende Konten unberührt", async () => {
    const anna = await person("anna");
    await db.execute(sql`ALTER TABLE users DROP COLUMN deleted_at`);
    const fs = await import("node:fs/promises");
    const file = await fs.readFile(fileURLToPath(new URL("../../apps/api/drizzle/0025_account_deletion.sql", import.meta.url)), "utf8");
    await db.execute(sql.raw(file));
    await db.execute(sql.raw(file));
    expect((await userRow(anna.id))?.deletedAt).toBeNull();
  });
});

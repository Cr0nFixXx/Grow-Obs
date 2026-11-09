import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { app } from "../../apps/api/src/app.ts";
import { client, db } from "../../apps/api/src/db/client.ts";
import { comments, communities, communityMembers, growLogs, grows, subs, threads, users, wikiArticles } from "../../apps/api/src/db/schema.ts";
import { hashPassword } from "../../apps/api/src/lib/password.ts";
import { SESSION_COOKIE } from "../../apps/api/src/lib/session.ts";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.ts";

const PASSWORD = "test-password-long-enough";

function call(path: string, { method = "GET", cookie, data }: { method?: string; cookie?: string; data?: unknown } = {}) {
  return app.request(path, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(data === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
async function makeUser(key: string, extra: Partial<typeof users.$inferInsert> = {}) {
  const [row] = await db.insert(users).values({ email: `${key}@example.org`, name: `Name ${key}`, handle: key, passwordHash: await hashPassword(PASSWORD), ...extra }).returning({ id: users.id });
  const res = await call("/auth/login", { method: "POST", data: { email: `${key}@example.org`, password: PASSWORD } });
  const raw = res.headers.getSetCookie().find((line) => line.startsWith(`${SESSION_COOKIE}=`))!;
  return { id: row!.id, handle: key, cookie: raw.split(";")[0]! };
}
type Who = Awaited<ReturnType<typeof makeUser>>;
const json = async <T = any>(res: Response) => (await res.json()) as T;

beforeAll(async () => {
  const name = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  if (process.env.NODE_ENV !== "test" || !name.endsWith("_test")) throw new Error("Integration tests require a dedicated *_test database");
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../apps/api/drizzle", import.meta.url)) });
});
beforeEach(async () => {
  await resetRateLimits();
  await db.execute(sql`TRUNCATE TABLE users, communities, subs, wiki_articles CASCADE`);
});
afterAll(async () => { await client.end({ timeout: 2 }); });

async function setup() {
  const owner = await makeUser("olli");
  const stranger = await makeUser("sam");
  const mate = await makeUser("mia");
  const [com] = await db.insert(communities).values({ name: "Gemeinsam", isPrivate: true, createdBy: owner.id }).returning();
  await db.insert(communityMembers).values([{ communityId: com!.id, userId: owner.id, role: "admin" }, { communityId: com!.id, userId: mate.id }]);
  const [priv, pub, comm] = await db.insert(grows).values([
    { userId: owner.id, name: "Privat", startDate: "2026-01-01" },
    { userId: owner.id, name: "Öffentlich", startDate: "2026-02-01", visibility: "public" },
    { userId: owner.id, name: "Nur Community", startDate: "2026-03-01", visibility: "community" },
  ]).returning();
  return { owner, stranger, mate, priv: priv!, pub: pub!, comm: comm! };
}

describe("Grow-Sichtbarkeit (B-92)", () => {
  it("Standard ist privat; der Besitzer ändert sie nur auf erlaubte Werte", async () => {
    const { owner, priv } = await setup();
    const g = await json(await call(`/grows/${priv.id}`, { cookie: owner.cookie }));
    expect(g.visibility).toBe("private");
    expect((await call(`/grows/${priv.id}`, { method: "PATCH", cookie: owner.cookie, data: { visibility: "friends" } })).status).toBe(400);
    const res = await call(`/grows/${priv.id}`, { method: "PATCH", cookie: owner.cookie, data: { visibility: "public" } });
    expect(res.status).toBe(200);
    expect((await json(res)).visibility).toBe("public");
  });

  it("andere dürfen die Sichtbarkeit nicht ändern", async () => {
    const { stranger, priv } = await setup();
    expect((await call(`/grows/${priv.id}`, { method: "PATCH", cookie: stranger.cookie, data: { visibility: "public" } })).status).toBe(404);
  });

  it("Liste: Besitzer sieht alle, Fremde nur öffentliche, Community-Mitglieder auch Community-Grows", async () => {
    const { owner, stranger, mate } = await setup();
    const names = async (who: Who) => (await json<any[]>(await call("/members/olli/grows", { cookie: who.cookie }))).map((g) => g.name).sort();
    expect(await names(owner)).toEqual(["Nur Community", "Privat", "Öffentlich"]);
    expect(await names(stranger)).toEqual(["Öffentlich"]);
    expect(await names(mate)).toEqual(["Nur Community", "Öffentlich"]);
  });

  it("Profil-Zähler zeigt Fremden nur sichtbare Grows (privat verrät sich nicht)", async () => {
    const { owner, stranger, mate } = await setup();
    expect((await json(await call("/members/olli", { cookie: stranger.cookie }))).stats.grows).toBe(1);
    expect((await json(await call("/members/olli", { cookie: mate.cookie }))).stats.grows).toBe(2);
    expect((await json(await call("/members/olli", { cookie: owner.cookie }))).stats.grows).toBe(3);
  });

  it("Detail: öffentlicher Grow mit Tagebuch lesbar, privater und fremder Community-Grow wie nicht vorhanden (404)", async () => {
    const { stranger, mate, pub, priv, comm } = await setup();
    await db.insert(growLogs).values({ growId: pub.id, title: "Tag 1", body: "Alles gut", loggedOn: "2026-02-02" });
    const ok = await call(`/members/olli/grows/${pub.id}`, { cookie: stranger.cookie });
    expect(ok.status).toBe(200);
    expect(await json(ok)).toMatchObject({ id: pub.id, name: "Öffentlich", visibility: "public", logs: [{ title: "Tag 1" }] });
    expect((await call(`/members/olli/grows/${priv.id}`, { cookie: stranger.cookie })).status).toBe(404);
    expect((await call(`/members/olli/grows/${comm.id}`, { cookie: stranger.cookie })).status).toBe(404);
    expect((await call(`/members/olli/grows/${comm.id}`, { cookie: mate.cookie })).status).toBe(200);
    expect((await call(`/members/olli/grows/nicht-gueltig`, { cookie: stranger.cookie })).status).toBe(404);
  });

  it("Profil nur für Follower: auch öffentliche Grows bleiben unsichtbar", async () => {
    const { owner, stranger } = await setup();
    await db.update(users).set({ profileVisibility: "followers" }).where(eq(users.id, owner.id));
    expect(await json(await call("/members/olli/grows", { cookie: stranger.cookie }))).toEqual([]);
  });
});

describe("Profil-Aktivität (B-92)", () => {
  it("zeigt Forum-Threads, Forum-Kommentare und Wiki-Artikel, aber keine ausgeblendeten", async () => {
    const { owner, stranger } = await setup();
    const [sub] = await db.insert(subs).values({ name: "r/Test" }).returning();
    const [t1, t2] = await db.insert(threads).values([
      { subId: sub!.id, userId: owner.id, title: "Mein Thread", body: "x" },
      { subId: sub!.id, userId: stranger.id, title: "Fremder Thread", body: "x" },
    ]).returning();
    await db.insert(threads).values({ subId: sub!.id, userId: owner.id, title: "Versteckt", body: "x", hiddenAt: new Date() });
    await db.insert(comments).values([{ threadId: t2!.id, userId: owner.id, body: "Antwort" }, { threadId: t1!.id, userId: owner.id, body: "Versteckt", hiddenAt: new Date() }]);
    await db.insert(wikiArticles).values({ title: "Mein Wiki", category: "Anbau", author: "olli", createdBy: owner.id });
    const list = await json<any[]>(await call("/members/olli/activity", { cookie: stranger.cookie }));
    expect(list.map((i) => `${i.kind}:${i.title}`).sort()).toEqual(["comment:Fremder Thread", "thread:Mein Thread", "wiki:Mein Wiki"]);
    const comment = list.find((i) => i.kind === "comment");
    expect(comment.targetId).toBe(t2!.id);
    expect(typeof comment.ago).toBe("string");
  });

  it("bei nicht sichtbarem Profil 403", async () => {
    const { owner, stranger } = await setup();
    await db.update(users).set({ profileVisibility: "nobody" }).where(eq(users.id, owner.id));
    expect((await call("/members/olli/activity", { cookie: stranger.cookie })).status).toBe(403);
  });
});

import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { app } from "../../apps/api/src/app.ts";
import { client, db } from "../../apps/api/src/db/client.ts";
import { communityBans, communityMembers, itemComments, notifications, posts, reports, sessions, users } from "../../apps/api/src/db/schema.ts";
import { signToken } from "../../apps/api/src/lib/jwt.ts";
import { SESSION_COOKIE } from "../../apps/api/src/lib/session.ts";
import { hashPassword } from "../../apps/api/src/lib/password.ts";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.ts";

const names = ["owner", "mod", "alice", "bob", "carol", "operator"] as const;
type Name = (typeof names)[number];
const ids = Object.fromEntries(names.map((n) => [n, randomUUID()])) as Record<Name, string>;
let tokens: Record<Name, string>;
let communityId: string;
let otherCommunityId: string;

function call(path: string, who?: Name, method = "GET", data?: unknown) {
  return app.request(path, {
    method,
    headers: { ...(who ? { Cookie: `${SESSION_COOKIE}=${tokens[who]}` } : {}), ...(data === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
const json = async <T = any>(res: Response) => (await res.json()) as T;

beforeAll(async () => {
  const name = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  if (process.env.NODE_ENV !== "test" || !name.endsWith("_test")) throw new Error("Integration tests require a dedicated *_test database");
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../apps/api/drizzle", import.meta.url)) });
});
afterAll(async () => { await client.end({ timeout: 5 }); });

async function sessionToken(who: Name): Promise<string> {
  const expiresAt = new Date(Date.now() + 3_600_000);
  const [row] = await db.insert(sessions).values({ userId: ids[who], expiresAt }).returning({ id: sessions.id });
  return signToken({ sub: ids[who], role: who === "operator" ? "platform_admin" : "member", sid: row!.id }, expiresAt);
}

beforeEach(async () => {
  await resetRateLimits();
  await db.execute(sql`TRUNCATE TABLE users, communities, conversations, subs, strains, hall_entries, item_comments RESTART IDENTITY CASCADE`);
  const passwordHash = await hashPassword("test-password-long-enough");
  await db.insert(users).values(names.map((n) => ({
    id: ids[n], name: n, email: `${n}@example.test`, handle: n, passwordHash,
    role: n === "operator" ? "platform_admin" as const : "member" as const,
  })));
  tokens = Object.fromEntries(await Promise.all(names.map(async (n) => [n, await sessionToken(n)]))) as Record<Name, string>;
  // Öffentliche Community: owner = admin, mod = Moderator, alice/bob = Mitglieder; carol = Außenstehende.
  const created = await json<{ id: string }>(await call("/communities", "owner", "POST", { name: "Living Soil", description: "", isPrivate: false }));
  communityId = created.id;
  await db.insert(communityMembers).values([
    { communityId, userId: ids.mod, role: "moderator" },
    { communityId, userId: ids.alice, role: "member" },
    { communityId, userId: ids.bob, role: "member" },
  ]);
  const other = await json<{ id: string }>(await call("/communities", "owner", "POST", { name: "Andere", description: "", isPrivate: true }));
  otherCommunityId = other.id;
});

async function post(who: Name, text = `Beitrag von ${who}`, community = communityId) {
  const res = await call("/social/posts", who, "POST", { text, communityId: community });
  expect(res.status).toBe(201);
  return json<{ id: string; communityId: string; mine: boolean }>(res);
}
async function comment(who: Name, postId: string, text = `Kommentar von ${who}`) {
  const res = await call(`/social/posts/${postId}/comments`, who, "POST", { text });
  expect(res.status).toBe(201);
  return json<{ id: string }>(res);
}
const feed = async (who: Name, community = communityId) => json<{ id: string; hidden?: boolean }[]>(await call(`/social/posts?communityId=${community}`, who));
const notificationsOf = (who: Name) => db.select().from(notifications).where(eq(notifications.userId, ids[who]));

describe("Feed je Community (B-61)", () => {
  it("nur Mitglieder schreiben und lesen; der globale Feed zeigt keine Community-Beiträge", async () => {
    expect((await call("/social/posts", "carol", "POST", { text: "Hallo", communityId })).status).toBe(403);
    const p = await post("alice");
    expect(p.communityId).toBe(communityId);
    expect(p.mine).toBe(true);
    expect((await feed("bob")).map((x) => x.id)).toEqual([p.id]);
    expect((await call(`/social/posts?communityId=${communityId}`, "carol")).status).toBe(404);
    // Privat: auch die Existenz bleibt verborgen.
    expect((await call(`/social/posts?communityId=${otherCommunityId}`, "alice")).status).toBe(404);
    // Global: ohne Community-Beiträge, normale Beiträge bleiben.
    const plain = await json<{ id: string }>(await call("/social/posts", "alice", "POST", { text: "global" }));
    const global = await json<{ id: string }[]>(await call("/social/posts", "carol"));
    expect(global.map((x) => x.id)).toEqual([plain.id]);
  });

  it("Kommentare und Likes eines Community-Beitrags sind für Außenstehende 404", async () => {
    const p = await post("alice");
    expect((await call(`/social/posts/${p.id}/comments`, "carol")).status).toBe(404);
    expect((await call(`/social/posts/${p.id}/comments`, "carol", "POST", { text: "x" })).status).toBe(404);
    expect((await call(`/social/posts/${p.id}/like`, "carol", "POST")).status).toBe(404);
    expect((await call(`/social/posts/${p.id}/like`, "bob", "POST")).status).toBe(200);
    await comment("bob", p.id);
    const list = await json<{ mine: boolean }[]>(await call(`/social/posts/${p.id}/comments`, "bob"));
    expect(list).toHaveLength(1);
    expect(list[0]!.mine).toBe(true);
  });
});

describe("Ausblenden (B-61)", () => {
  it("Moderator blendet einen Beitrag aus: Mitglieder sehen ihn nicht mehr, die Moderation schon (hidden), Autor wird benachrichtigt", async () => {
    const p = await post("alice");
    expect((await call(`/communities/${communityId}/posts/${p.id}/hide`, "bob", "POST")).status).toBe(403);
    expect((await call(`/communities/${communityId}/posts/${p.id}/hide`, "mod", "POST")).status).toBe(200);
    expect(await feed("alice")).toEqual([]);
    expect(await feed("bob")).toEqual([]);
    expect(await feed("mod")).toMatchObject([{ id: p.id, hidden: true }]);
    expect(await feed("owner")).toMatchObject([{ id: p.id, hidden: true }]);
    expect((await call(`/social/posts/${p.id}/comments`, "bob")).status).toBe(404);
    expect((await call(`/social/posts/${p.id}/like`, "bob", "POST")).status).toBe(404);
    expect((await notificationsOf("alice")).map((n) => n.title)).toContain("Dein Beitrag wurde ausgeblendet");
    // wieder einblenden (idempotent)
    expect((await call(`/communities/${communityId}/posts/${p.id}/unhide`, "mod", "POST")).status).toBe(200);
    expect((await call(`/communities/${communityId}/posts/${p.id}/unhide`, "mod", "POST")).status).toBe(200);
    expect((await feed("bob")).map((x) => x.id)).toEqual([p.id]);
  });

  it("Moderatoren fassen Inhalte von Admins nicht an, Admins schon; falsche Community = 404", async () => {
    const adminPost = await post("owner");
    expect((await call(`/communities/${communityId}/posts/${adminPost.id}/hide`, "mod", "POST")).status).toBe(403);
    expect((await call(`/communities/${communityId}/posts/${adminPost.id}/hide`, "owner", "POST")).status).toBe(200);
    const p = await post("alice");
    expect((await call(`/communities/${otherCommunityId}/posts/${p.id}/hide`, "owner", "POST")).status).toBe(404);
    expect((await call(`/communities/${communityId}/posts/${randomUUID()}/hide`, "mod", "POST")).status).toBe(404);
    expect((await call(`/communities/${communityId}/posts/${p.id}/hide`, "carol", "POST")).status).toBe(403);
  });

  it("ausgeblendete Kommentare verschwinden für Mitglieder und aus dem Zähler; Moderatoren sehen sie markiert", async () => {
    const p = await post("alice");
    const c1 = await comment("bob", p.id);
    await comment("bob", p.id, "bleibt");
    const ownerComment = await comment("owner", p.id, "vom Admin");
    expect((await call(`/communities/${communityId}/comments/${c1.id}/hide`, "alice", "POST")).status).toBe(403);
    expect((await call(`/communities/${communityId}/comments/${ownerComment.id}/hide`, "mod", "POST")).status).toBe(403);
    expect((await call(`/communities/${communityId}/comments/${c1.id}/hide`, "mod", "POST")).status).toBe(200);
    const asMember = await json<{ id: string }[]>(await call(`/social/posts/${p.id}/comments`, "alice"));
    expect(asMember.map((c) => c.id)).not.toContain(c1.id);
    expect(asMember).toHaveLength(2);
    const asMod = await json<{ id: string; hidden?: boolean }[]>(await call(`/social/posts/${p.id}/comments`, "mod"));
    expect(asMod).toHaveLength(3);
    expect(asMod.find((c) => c.id === c1.id)?.hidden).toBe(true);
    expect((await json<{ comments: number }[]>(await call(`/social/posts?communityId=${communityId}`, "alice")))[0]!.comments).toBe(2);
    expect((await notificationsOf("bob")).map((n) => n.title)).toContain("Dein Kommentar wurde ausgeblendet");
    expect((await call(`/communities/${communityId}/comments/${c1.id}/unhide`, "mod", "POST")).status).toBe(200);
    expect(await json<unknown[]>(await call(`/social/posts/${p.id}/comments`, "alice"))).toHaveLength(3);
  });
});

describe("Meldungen und Warteschlange (B-61)", () => {
  const report = (who: Name, kind: "post" | "comment", targetId: string, reason = "spam", details = "") =>
    call(`/communities/${communityId}/reports`, who, "POST", { kind, targetId, reason, details });

  it("Mitglieder melden; doppelt = 200 duplicate; eigene/fremde Inhalte und Außenstehende werden abgewiesen", async () => {
    const p = await post("alice");
    expect((await report("bob", "post", p.id, "spam", "Werbung")).status).toBe(201);
    const again = await report("bob", "post", p.id);
    expect(again.status).toBe(200);
    expect(await json(again)).toMatchObject({ duplicate: true });
    expect((await report("alice", "post", p.id)).status).toBe(400);
    expect((await report("carol", "post", p.id)).status).toBe(403);
    expect((await report("bob", "post", randomUUID())).status).toBe(404);
    expect((await call(`/communities/${communityId}/reports`, "bob", "POST", { kind: "post", targetId: p.id, reason: "boese" })).status).toBe(400);
    const other = await post("owner", "andere", otherCommunityId);
    expect((await report("bob", "post", other.id)).status).toBe(404);
    expect(await db.select().from(reports)).toHaveLength(1);
  });

  it("die Warteschlange ist nur für Moderation sichtbar und gruppiert nach Inhalt", async () => {
    const p = await post("alice", "Kaufe jetzt!!!");
    const c = await comment("alice", p.id, "Kommentar-Spam");
    await report("bob", "post", p.id, "spam", "Werbung");
    await report("mod", "post", p.id, "offtopic");
    await report("bob", "comment", c.id, "harassment");
    expect((await call(`/communities/${communityId}/reports`, "bob")).status).toBe(403);
    expect((await call(`/communities/${communityId}/reports`, "carol")).status).toBe(403);
    const queue = await json<any[]>(await call(`/communities/${communityId}/reports`, "mod"));
    expect(queue).toHaveLength(2);
    const group = queue.find((g) => g.kind === "post");
    expect(group).toMatchObject({ count: 2, status: "open", preview: { text: "Kaufe jetzt!!!", author: "alice", hidden: false } });
    expect(group.reports.map((r: any) => r.reporter).sort()).toEqual(["bob", "mod"]);
    expect(queue.find((g) => g.kind === "comment")).toMatchObject({ count: 1, preview: { text: "Kommentar-Spam" } });
    // Badge: offene Meldungen nur für die Moderation im Detail
    expect((await json(await call(`/communities/${communityId}`, "mod"))).openReports).toBe(3);
    expect((await json(await call(`/communities/${communityId}`, "alice"))).openReports).toBeUndefined();
  });

  it("‚Ausblenden‘ erledigt alle Meldungen zum Inhalt, blendet ihn aus und benachrichtigt den Autor; ‚Kein Verstoß‘ lässt ihn stehen", async () => {
    const p1 = await post("alice", "schlecht");
    const p2 = await post("bob", "harmlos");
    await report("bob", "post", p1.id);
    await report("mod", "post", p1.id);
    await report("alice", "post", p2.id);
    const resolve = (kind: string, targetId: string, action: string, who: Name = "mod") =>
      call(`/communities/${communityId}/reports/resolve`, who, "POST", { kind, targetId, action });
    expect((await resolve("post", p1.id, "hide", "bob")).status).toBe(403);
    expect(await json(await resolve("post", p1.id, "hide"))).toMatchObject({ ok: true, resolved: 2 });
    expect(await feed("alice")).toMatchObject([{ id: p2.id }]);
    expect((await notificationsOf("alice")).map((n) => n.title)).toContain("Dein Beitrag wurde ausgeblendet");
    expect((await resolve("post", p1.id, "hide")).status).toBe(404); // nichts mehr offen
    expect(await json(await resolve("post", p2.id, "dismiss", "owner"))).toMatchObject({ resolved: 1 });
    expect((await feed("bob")).map((x) => x.id)).toContain(p2.id);
    expect(await json<any[]>(await call(`/communities/${communityId}/reports`, "mod"))).toEqual([]);
    const closed = await json<any[]>(await call(`/communities/${communityId}/reports?status=closed`, "mod"));
    expect(closed.map((g) => [g.targetId, g.status]).sort()).toEqual([[p1.id, "hidden"], [p2.id, "dismissed"]].sort());
    expect(closed.find((g) => g.targetId === p1.id)).toMatchObject({ resolvedBy: "mod", count: 2 });
    // einmal entschieden: dieselbe Person kann denselben Inhalt nicht erneut melden
    expect(await json(await report("alice", "post", p2.id))).toMatchObject({ duplicate: true });
    expect((await report("mod", "post", p2.id)).status).toBe(201); // andere Person: neue Meldung möglich
  });

  it("Moderatoren können Inhalte von Admins nicht per Meldung ausblenden (nur ‚Kein Verstoß‘)", async () => {
    const p = await post("owner", "Admin-Beitrag");
    await report("alice", "post", p.id);
    const resolve = (action: string, who: Name) => call(`/communities/${communityId}/reports/resolve`, who, "POST", { kind: "post", targetId: p.id, action });
    expect((await resolve("hide", "mod")).status).toBe(403);
    expect(await db.select().from(reports).where(eq(reports.status, "open"))).toHaveLength(1);
    expect((await resolve("hide", "owner")).status).toBe(200);
  });

  it("Meldungen werden begrenzt (20/Stunde je Person)", async () => {
    const p = await post("alice");
    const targets = await Promise.all(Array.from({ length: 21 }, (_, i) => comment("alice", p.id, `c${i}`)));
    const statuses: number[] = [];
    for (const t of targets) statuses.push((await report("bob", "comment", t.id)).status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(20);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("Rauswurf und Sperre (B-61)", () => {
  const kick = (who: Name, target: Name, body?: unknown) => call(`/communities/${communityId}/members/${ids[target]}`, who, "DELETE", body ?? {});
  const members = async () => (await db.select().from(communityMembers).where(eq(communityMembers.communityId, communityId))).map((m) => m.userId);

  it("Rechte: Mitglieder nie; Moderatoren nur Mitglieder; Admins auch Moderatoren; Admins und man selbst nie", async () => {
    expect((await kick("alice", "bob")).status).toBe(403);
    expect((await kick("carol", "bob")).status).toBe(403);
    expect((await kick("mod", "owner")).status).toBe(409);
    expect((await kick("owner", "owner")).status).toBe(400);
    expect((await kick("mod", "mod")).status).toBe(400);
    expect((await kick("owner", "carol")).status).toBe(404);
    // zweiter Moderator: Moderator kann Moderator nicht entfernen
    await db.insert(communityMembers).values({ communityId, userId: ids.carol, role: "moderator" });
    expect((await kick("mod", "carol")).status).toBe(403);
    expect((await kick("owner", "carol")).status).toBe(200);
    expect(await members()).not.toContain(ids.carol);
    expect((await kick("mod", "alice")).status).toBe(200);
    expect(await members()).not.toContain(ids.alice);
  });

  it("der Rausgeworfene verliert den Zugriff und wird benachrichtigt; ohne Sperre darf er in öffentlichen Communities wieder beitreten", async () => {
    const p = await post("alice");
    expect((await kick("mod", "alice")).status).toBe(200);
    expect((await call(`/social/posts?communityId=${communityId}`, "alice")).status).toBe(404);
    expect((await call(`/social/posts/${p.id}/comments`, "alice")).status).toBe(404);
    expect((await notificationsOf("alice")).map((n) => n.title)).toContain("Du wurdest aus „Living Soil“ entfernt");
    expect(await db.select().from(communityBans)).toHaveLength(0);
    expect((await call(`/communities/${communityId}/join`, "alice", "POST")).status).toBe(200);
    expect(await members()).toContain(ids.alice);
  });

  it("mit Sperre: kein Beitritt (öffentlich und per Code); nur Admins sehen/heben die Sperrliste auf", async () => {
    expect((await call(`/communities/${communityId}/members/${ids.alice}?ban=true`, "mod", "DELETE")).status).toBe(200); // Browser-Variante: Query statt Body
    expect(await db.select().from(communityBans)).toHaveLength(1);
    expect((await call(`/communities/${communityId}/join`, "alice", "POST")).status).toBe(403);
    // per Code (Einladung ist eine Verbrauchsbestätigung, die bei Sperre nicht verbraucht wird)
    const invitation = await json<{ code: string }>(await call(`/communities/${communityId}/invites`, "owner", "POST"));
    expect((await call("/communities/join", "alice", "POST", invitation)).status).toBe(403);
    expect((await call("/communities/join", "bob", "POST", invitation)).status).toBe(200); // Mitglied: verbraucht nichts
    // Sperrliste
    expect((await call(`/communities/${communityId}/bans`, "mod")).status).toBe(403);
    expect((await call(`/communities/${communityId}/bans`, "alice")).status).toBe(403);
    const list = await json<{ id: string; name: string }[]>(await call(`/communities/${communityId}/bans`, "owner"));
    expect(list).toMatchObject([{ id: ids.alice, name: "alice" }]);
    expect((await call(`/communities/${communityId}/bans/${ids.alice}`, "mod", "DELETE")).status).toBe(403);
    expect((await call(`/communities/${communityId}/bans/${ids.alice}`, "owner", "DELETE")).status).toBe(200);
    expect((await call(`/communities/${communityId}/bans/${ids.alice}`, "owner", "DELETE")).status).toBe(404);
    expect((await call(`/communities/${communityId}/join`, "alice", "POST")).status).toBe(200);
  });

  it("Rollenwechsel bleibt Admin-Sache: Moderatoren können niemanden zum Moderator machen", async () => {
    const path = (u: Name) => `/communities/${communityId}/members/${ids[u]}/role`;
    expect((await call(path("alice"), "mod", "PATCH", { role: "moderator" })).status).toBe(403);
    expect((await call(path("alice"), "owner", "PATCH", { role: "moderator" })).status).toBe(200);
  });
});

describe("Aufräumen und Datenschutz (B-61)", () => {
  it("Admin-Löschen eines Beitrags entfernt Kommentare und Meldungen; Community-Beiträge fehlen in der Betreiber-Inhaltsliste", async () => {
    const p = await post("alice");
    const c = await comment("bob", p.id);
    await call(`/communities/${communityId}/reports`, "bob", "POST", { kind: "post", targetId: p.id, reason: "spam" });
    await call(`/communities/${communityId}/reports`, "alice", "POST", { kind: "comment", targetId: c.id, reason: "spam" });
    const globalPost = await json<{ id: string }>(await call("/social/posts", "alice", "POST", { text: "global" }));
    const content = await json<{ id: string; type: string }[]>(await call("/admin/content", "operator"));
    expect(content.filter((x) => x.type === "post").map((x) => x.id)).toEqual([globalPost.id]);
    expect((await call(`/admin/posts/${p.id}`, "operator", "DELETE")).status).toBe(200);
    expect(await db.select().from(itemComments)).toHaveLength(0);
    expect(await db.select().from(reports)).toHaveLength(0);
    expect(await db.select().from(posts).where(eq(posts.id, p.id))).toHaveLength(0);
  });
});

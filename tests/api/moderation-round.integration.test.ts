import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { app } from "../../apps/api/src/app.ts";
import { client, db } from "../../apps/api/src/db/client.ts";
import {
  comments, communities, communityMembers, itemComments, moderationLog, notifications, posts, reports, sessions, subs, threads, users,
} from "../../apps/api/src/db/schema.ts";
import { signToken } from "../../apps/api/src/lib/jwt.ts";
import { hashPassword } from "../../apps/api/src/lib/password.ts";
import { SESSION_COOKIE } from "../../apps/api/src/lib/session.ts";
import { resetRateLimits } from "../../apps/api/src/middleware/rate-limit.ts";

const PASSWORD = "test-password-long-enough";
const ROLES = { op: "platform_admin", op2: "platform_admin", adm: "admin", mod: "moderator" } as const;
type Name = "op" | "op2" | "adm" | "mod" | "alice" | "bob" | "carol";
const NAMES: Name[] = ["op", "op2", "adm", "mod", "alice", "bob", "carol"];
const ids = Object.fromEntries(NAMES.map((n) => [n, randomUUID()])) as Record<Name, string>;
let tokens: Record<Name, string>;
const ALL_DELETE = { forum: "delete", feed: "delete", comments: "delete", chat: "delete", media: "remove" } as const;

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

let threadId: string;
beforeEach(async () => {
  await resetRateLimits();
  await db.execute(sql`TRUNCATE TABLE users, communities, conversations, subs, moderation_log CASCADE`);
  const passwordHash = await hashPassword(PASSWORD);
  await db.insert(users).values(NAMES.map((n, i) => ({
    id: ids[n], name: n, email: `${n}@example.test`, handle: n, passwordHash, role: (ROLES as Record<string, "admin">)[n] ?? "member" as const,
    createdAt: new Date(Date.now() - (10 - i) * 1000),
  })));
  const entries = await Promise.all(NAMES.map(async (n) => {
    const expiresAt = new Date(Date.now() + 3_600_000);
    const [s] = await db.insert(sessions).values({ userId: ids[n], expiresAt }).returning({ id: sessions.id });
    return [n, await signToken({ sub: ids[n], role: "member", sid: s!.id }, expiresAt)] as const;
  }));
  tokens = Object.fromEntries(entries) as Record<Name, string>;
  const [sub] = await db.insert(subs).values({ name: "r/Test" }).returning();
  const [t] = await db.insert(threads).values({ subId: sub!.id, userId: ids.alice, title: "Alices Thread", body: "Text" }).returning();
  threadId = t!.id;
});

const report = (who: Name, kind: string, targetId: string, reason = "spam") => call("/moderation/reports", who, "POST", { kind, targetId, reason, details: "x" });
const globalPost = async (who: Name, text = `Beitrag ${who}`) => json<{ id: string }>(await call("/social/posts", who, "POST", { text }));

describe("Konten sperren (nur Betreiber)", () => {
  it("sperrt, beendet Sitzungen, zeigt den Grund beim Login und lässt sich aufheben – protokolliert", async () => {
    expect((await call(`/admin/users/${ids.bob}/ban`, "adm", "POST", {})).status).toBe(403);
    expect((await call(`/admin/users/${ids.bob}/ban`, "bob", "POST", {})).status).toBe(403);
    expect((await call(`/admin/users/${ids.op}/ban`, "op", "POST", {})).status).toBe(400); // nicht sich selbst
    expect((await call(`/admin/users/${ids.op2}/ban`, "op", "POST", {})).status).toBe(403); // nicht einen anderen Betreiber

    expect((await call("/auth/me", "bob")).status).toBe(200);
    expect((await call(`/admin/users/${ids.bob}/ban`, "op", "POST", { reason: "Spam in Serie" })).status).toBe(200);
    expect((await call("/auth/me", "bob")).status).toBe(401); // Sitzung beendet
    expect(await db.select().from(sessions).where(eq(sessions.userId, ids.bob))).toHaveLength(0);

    const login = (password: string) => call("/auth/login", undefined, "POST", { email: "bob@example.test", password });
    const denied = await login(PASSWORD);
    expect(denied.status).toBe(403);
    expect(await json(denied)).toMatchObject({ code: "account_banned", reason: "Spam in Serie" });
    expect((await login("falsches-passwort-hier")).status).toBe(401); // Grund nur nach richtigem Passwort

    const list = await json<any[]>(await call("/admin/users", "op"));
    expect(list.find((u) => u.id === ids.bob)).toMatchObject({ status: "gesperrt", banReason: "Spam in Serie" });

    expect((await call(`/admin/users/${ids.bob}/unban`, "op", "POST")).status).toBe(200);
    expect((await login(PASSWORD)).status).toBe(200);

    const log = await json<{ items: any[] }>(await call("/admin/moderation-log", "op"));
    expect(log.items.map((e) => [e.action, e.actor, e.target, e.reason])).toEqual([["unban", "op", "bob", null], ["ban", "op", "bob", "Spam in Serie"]]);
    expect((await call("/admin/moderation-log", "adm")).status).toBe(403);
  });

  it("ein Token eines gesperrten Kontos wird auch ohne beendete Sitzung abgelehnt", async () => {
    await db.update(users).set({ bannedAt: new Date() }).where(eq(users.id, ids.carol));
    expect((await call("/auth/me", "carol")).status).toBe(401);
  });
});

describe("Fremdes Konto löschen (nur Betreiber)", () => {
  const del = (who: Name, target: Name, extra: Record<string, unknown> = {}) =>
    call(`/admin/users/${ids[target]}`, who, "DELETE", { password: PASSWORD, confirm: "LÖSCHEN", options: ALL_DELETE, ...extra });

  it("verlangt Betreiber, Passwort und Bestätigung; trifft nie sich selbst oder andere Betreiber", async () => {
    expect((await del("adm", "bob")).status).toBe(403);
    expect((await del("op", "bob", { password: "falsch-falsch-falsch" })).status).toBe(403);
    expect((await del("op", "bob", { confirm: "ja" })).status).toBe(400);
    expect((await del("op", "op")).status).toBe(400);
    expect((await del("op", "op2")).status).toBe(403);
    expect((await db.select().from(users).where(eq(users.id, ids.bob)))).toHaveLength(1);
  });

  it("löscht nach Auswahl; der Alleinadmin einer Community wird durch das dienstälteste Mitglied ersetzt; Protokoll behält den Namen", async () => {
    const [community] = await db.insert(communities).values({ name: "Heim", createdBy: ids.bob }).returning();
    await db.insert(communityMembers).values([
      { communityId: community!.id, userId: ids.bob, role: "admin", joinedAt: new Date(Date.now() - 5000) },
      { communityId: community!.id, userId: ids.alice, role: "member", joinedAt: new Date(Date.now() - 4000) },
      { communityId: community!.id, userId: ids.carol, role: "member", joinedAt: new Date(Date.now() - 3000) },
    ]);
    await call("/social/posts", "bob", "POST", { text: "Spam", communityId: community!.id });
    const res = await del("op", "bob", { reason: "Spam" });
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ ok: true });
    const members = await db.select().from(communityMembers).where(eq(communityMembers.communityId, community!.id));
    expect(members.find((m) => m.userId === ids.alice)?.role).toBe("admin");
    expect(members.some((m) => m.userId === ids.bob)).toBe(false);
    expect(await db.select().from(posts).where(eq(posts.userId, ids.bob))).toHaveLength(0);
    expect((await call("/auth/me", "bob")).status).toBe(401);
    const log = await json<{ items: any[] }>(await call("/admin/moderation-log", "op"));
    expect(log.items[0]).toMatchObject({ action: "delete_account", actor: "op", target: "bob", reason: "Spam" });
  });

  it("‚anonym stehen lassen‘ lässt Beiträge als Hülle stehen", async () => {
    await globalPost("carol", "bleibt");
    await call(`/social/posts/${(await db.select().from(posts))[0]!.id}/comments`, "alice", "POST", { text: "Antwort" });
    const res = await del("op", "carol", { options: { ...ALL_DELETE, feed: "keep" } });
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ mode: "anonymized" });
    const [p] = await db.select().from(posts);
    expect(p!.text).toBe("bleibt");
    expect((await db.select().from(users).where(eq(users.id, ids.carol)))[0]).toMatchObject({ name: "Gelöschtes Mitglied" });
  });
});

describe("Globales Melden und Ausblenden (Forum + Feed)", () => {
  it("jede angemeldete Person kann Threads, Forum-Kommentare, Beiträge und Kommentare melden – aber nicht Eigenes, Doppeltes oder Community-Inhalte", async () => {
    const [cm] = await db.insert(comments).values({ threadId, userId: ids.bob, body: "Forumskommentar" }).returning();
    const p = await globalPost("alice");
    const [ic] = await db.insert(itemComments).values({ kind: "post", itemId: p.id, userId: ids.bob, body: "Feedkommentar" }).returning();
    expect((await call("/moderation/reports", undefined, "POST", { kind: "thread", targetId: threadId, reason: "spam" })).status).toBe(401);
    expect((await report("bob", "thread", threadId)).status).toBe(201);
    expect(await json(await report("bob", "thread", threadId))).toMatchObject({ duplicate: true });
    expect((await report("alice", "thread", threadId)).status).toBe(400); // eigener Inhalt
    expect((await report("carol", "forum_comment", cm!.id, "harassment")).status).toBe(201);
    expect((await report("carol", "post", p.id)).status).toBe(201);
    expect((await report("carol", "comment", ic!.id)).status).toBe(201);
    expect((await report("carol", "thread", randomUUID())).status).toBe(404);
    expect((await call("/moderation/reports", "carol", "POST", { kind: "thread", targetId: threadId, reason: "boese" })).status).toBe(400);
    // Community-Beitrag gehört nicht in die globale Queue
    const [community] = await db.insert(communities).values({ name: "Privat", createdBy: ids.alice }).returning();
    const [cp] = await db.insert(posts).values({ userId: ids.alice, text: "intern", communityId: community!.id }).returning();
    expect((await report("bob", "post", cp!.id)).status).toBe(404);
    expect(await db.select().from(reports).where(eq(reports.kind, "post"))).toHaveLength(1);
  });

  it("die Queue sehen nur Plattform-Moderatoren, Admins und Betreiber", async () => {
    await report("bob", "thread", threadId);
    for (const who of ["bob", "carol"] as const) expect((await call("/moderation/reports", who)).status).toBe(403);
    for (const who of ["mod", "adm", "op"] as const) {
      const queue = await json(await call("/moderation/reports", who));
      expect(queue).toMatchObject({ hasMore: false, items: [{ kind: "thread", count: 1, status: "open", preview: { title: "Alices Thread", author: "alice" } }] });
    }
  });

  it("‚Ausblenden‘ entscheidet die Meldung, versteckt Thread und Kommentar für alle außer der Moderation und benachrichtigt den Autor", async () => {
    const [cm] = await db.insert(comments).values({ threadId, userId: ids.bob, body: "Gemeiner Kommentar" }).returning();
    await report("carol", "thread", threadId);
    await report("carol", "forum_comment", cm!.id);
    const resolve = (who: Name, kind: string, targetId: string, action: string) => call("/moderation/reports/resolve", who, "POST", { kind, targetId, action });
    expect((await resolve("bob", "thread", threadId, "hide")).status).toBe(403);
    expect(await json(await resolve("mod", "forum_comment", cm!.id, "hide"))).toMatchObject({ ok: true, resolved: 1 });
    expect((await resolve("mod", "forum_comment", cm!.id, "hide")).status).toBe(404);

    const detail = await json<any>(await call(`/forum/threads/${threadId}`, "carol"));
    expect(detail.comments).toBe(0);
    expect(detail.commentsList[0]).toMatchObject({ id: cm!.id, body: "", author: "", hidden: true });
    const anonymous = await json<any>(await call(`/forum/threads/${threadId}`));
    expect(anonymous.commentsList[0]).toMatchObject({ body: "", author: "" });
    const asMod = await json<any>(await call(`/forum/threads/${threadId}`, "mod"));
    expect(asMod.commentsList[0]).toMatchObject({ body: "Gemeiner Kommentar", author: "bob", hidden: true });
    expect((await db.select().from(notifications).where(eq(notifications.userId, ids.bob))).map((n) => n.title)).toContain("Dein Kommentar wurde ausgeblendet");

    expect((await resolve("adm", "thread", threadId, "hide")).status).toBe(200);
    expect((await call(`/forum/threads/${threadId}`, "carol")).status).toBe(404);
    expect((await call(`/forum/threads/${threadId}`)).status).toBe(404);
    expect((await json<any[]>(await call("/forum/threads", "carol"))).map((t) => t.id)).not.toContain(threadId);
    expect((await json<any[]>(await call("/forum/threads"))).map((t) => t.id)).not.toContain(threadId);
    expect(await json<any[]>(await call("/forum/threads", "mod"))).toMatchObject([{ id: threadId, hidden: true }]);
    expect((await call(`/forum/threads/${threadId}/comments`, "carol", "POST", { text: "hallo" })).status).toBe(404);

    // wieder einblenden
    expect(await json(await call("/moderation/hide", "mod", "POST", { kind: "thread", targetId: threadId, hidden: false }))).toMatchObject({ hidden: false });
    expect((await call(`/forum/threads/${threadId}`, "carol")).status).toBe(200);

    const log = await json<{ items: any[] }>(await call("/admin/moderation-log", "op"));
    expect(log.items.map((e) => e.action)).toEqual(["unhide", "report_hide", "report_hide"]);
  });

  it("‚Kein Verstoß‘ lässt den Inhalt stehen; globale Beiträge und ihre Kommentare lassen sich ausblenden", async () => {
    const p = await globalPost("bob");
    await report("carol", "post", p.id);
    expect(await json(await call("/moderation/reports/resolve", "mod", "POST", { kind: "post", targetId: p.id, action: "dismiss" }))).toMatchObject({ resolved: 1 });
    const closed = await json<any>(await call("/moderation/reports?status=closed", "mod"));
    expect(closed.items[0]).toMatchObject({ kind: "post", status: "dismissed", resolvedBy: "mod" });
    expect((await json<any[]>(await call("/social/posts", "carol"))).map((x) => x.id)).toContain(p.id);

    const [ic] = await db.insert(itemComments).values({ kind: "post", itemId: p.id, userId: ids.carol, body: "Pöbelei" }).returning();
    expect((await call("/moderation/hide", "carol", "POST", { kind: "comment", targetId: ic!.id, hidden: true })).status).toBe(403);
    expect((await call("/moderation/hide", "mod", "POST", { kind: "comment", targetId: ic!.id, hidden: true })).status).toBe(200);
    expect(await json<any[]>(await call(`/social/posts/${p.id}/comments`, "alice"))).toEqual([]);
    expect(await json<any[]>(await call(`/social/posts/${p.id}/comments`, "mod"))).toMatchObject([{ body: "Pöbelei", hidden: true }]);
    expect((await call("/moderation/hide", "adm", "POST", { kind: "post", targetId: p.id, hidden: true })).status).toBe(200);
    expect((await json<any[]>(await call("/social/posts", "alice"))).map((x) => x.id)).not.toContain(p.id);
    expect((await json<any[]>(await call("/social/posts", "mod"))).find((x) => x.id === p.id)).toMatchObject({ hidden: true });
    expect((await call(`/social/posts/${p.id}/like`, "alice", "POST")).status).toBe(404);
  });

  it("Rangfolge: Moderatoren blenden keine Inhalte von Admins aus, Admins keine von Betreibern – Betreiber alles", async () => {
    const byAdm = await globalPost("adm");
    const byOp = await globalPost("op");
    const byMod = await globalPost("mod");
    const hide = (who: Name, id: string) => call("/moderation/hide", who, "POST", { kind: "post", targetId: id, hidden: true });
    expect((await hide("mod", byAdm.id)).status).toBe(403);
    expect((await hide("mod", byMod.id)).status).toBe(403); // gleicher Rang
    expect((await hide("adm", byOp.id)).status).toBe(403);
    expect((await hide("adm", byMod.id)).status).toBe(200);
    expect((await hide("op", byAdm.id)).status).toBe(200);
    expect((await hide("op", byOp.id)).status).toBe(200);
  });
});

describe("Warteschlange seitenweise", () => {
  it("Community- und globale Queue liefern {items, hasMore} in Seiten zu 20 (keine harte Kappung mehr)", async () => {
    const [community] = await db.insert(communities).values({ name: "Viel los", createdBy: ids.adm }).returning();
    await db.insert(communityMembers).values([{ communityId: community!.id, userId: ids.adm, role: "admin" }, { communityId: community!.id, userId: ids.bob, role: "member" }]);
    const rows = Array.from({ length: 25 }, (_, i) => ({ id: randomUUID(), i }));
    await db.insert(posts).values(rows.map((r) => ({ id: r.id, userId: ids.alice, text: `Beitrag ${r.i}`, communityId: community!.id })));
    await db.insert(reports).values(rows.map((r, i) => ({ communityId: community!.id, reporterId: ids.bob, kind: "post" as const, targetId: r.id, reason: "spam" as const, createdAt: new Date(Date.now() - (100 - i) * 1000) })));
    const first = await json<any>(await call(`/communities/${community!.id}/reports`, "adm"));
    expect(first.items).toHaveLength(20);
    expect(first.hasMore).toBe(true);
    expect(first.items[0].preview.text).toBe("Beitrag 0"); // älteste zuerst
    const second = await json<any>(await call(`/communities/${community!.id}/reports?offset=20`, "adm"));
    expect(second.items).toHaveLength(5);
    expect(second.hasMore).toBe(false);
    expect(new Set([...first.items, ...second.items].map((g: any) => g.targetId)).size).toBe(25);

    const gids = Array.from({ length: 21 }, () => randomUUID());
    await db.insert(posts).values(gids.map((id, i) => ({ id, userId: ids.alice, text: `Global ${i}` })));
    await db.insert(reports).values(gids.map((id) => ({ communityId: null, reporterId: ids.bob, kind: "post" as const, targetId: id, reason: "spam" as const })));
    const g1 = await json<any>(await call("/moderation/reports", "mod"));
    expect(g1.items).toHaveLength(20);
    expect(g1.hasMore).toBe(true);
    expect((await json<any>(await call("/moderation/reports?offset=20", "mod"))).items).toHaveLength(1);
    // die Community-Queue enthält keine globalen Meldungen und umgekehrt
    expect((await json<any>(await call(`/communities/${community!.id}/reports?offset=20`, "adm"))).items).toHaveLength(5);
  });
});

describe("Community verlassen", () => {
  const leave = (who: Name, communityId: string) => call(`/communities/${communityId}/leave`, who, "POST");
  it("Mitglieder gehen jederzeit; der alleinige Admin erst nach Übergabe; das letzte Mitglied nie; kein Eintrag in der Sperrliste", async () => {
    const [community] = await db.insert(communities).values({ name: "Gehen", createdBy: ids.alice }).returning();
    const id = community!.id;
    await db.insert(communityMembers).values([
      { communityId: id, userId: ids.alice, role: "admin" }, { communityId: id, userId: ids.bob, role: "member" }, { communityId: id, userId: ids.carol, role: "moderator" },
    ]);
    expect((await leave("mod", id)).status).toBe(404); // kein Mitglied
    expect((await leave("alice", id)).status).toBe(409);
    expect((await leave("bob", id)).status).toBe(200);
    expect((await call(`/communities/${id}/join`, "bob", "POST")).status).toBeLessThan(300); // nicht gesperrt
    expect((await leave("bob", id)).status).toBe(200);
    expect((await call(`/communities/${id}/members/${ids.carol}/role`, "alice", "PATCH", { role: "admin" })).status).toBe(200);
    expect((await leave("alice", id)).status).toBe(200);
    const left = await db.select().from(communityMembers).where(and(eq(communityMembers.communityId, id)));
    expect(left.map((m) => [m.userId, m.role])).toEqual([[ids.carol, "admin"]]);
    expect((await leave("carol", id)).status).toBe(409); // letztes Mitglied
  });
});

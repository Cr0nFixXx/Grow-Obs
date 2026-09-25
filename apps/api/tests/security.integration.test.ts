import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { app } from "../src/app.ts";
import { client, db } from "../src/db/client.ts";
import { hallEntries, subs, threads, communities, communityMembers, conversationMembers, conversations, grows, invites, media, messages, postLikes, posts, strains, users } from "../src/db/schema.ts";
import { signToken } from "../src/lib/jwt.ts";
import { hashPassword } from "../src/lib/password.ts";

const ids = { owner: randomUUID(), alice: randomUUID(), bob: randomUUID(), operator: randomUUID() };
let tokens: Record<keyof typeof ids, string>;
let passwordHash: string;

function call(path: string, token?: string, method = "GET", data?: unknown) {
  return app.request(path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(data === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}

beforeAll(async () => {
  // Fail rather than truncate a developer/production database accidentally.
  const name = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  if (process.env.NODE_ENV !== "test" || !name.endsWith("_test")) throw new Error("Integration tests require a dedicated *_test database");
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  passwordHash = await hashPassword("test-password-long-enough");
  tokens = {
    owner: await signToken({ sub: ids.owner, role: "member" }),
    alice: await signToken({ sub: ids.alice, role: "member" }),
    bob: await signToken({ sub: ids.bob, role: "member" }),
    operator: await signToken({ sub: ids.operator, role: "platform_admin" }),
  };
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE TABLE users, communities, conversations, subs, strains, hall_entries, item_comments RESTART IDENTITY CASCADE`);
  await db.insert(users).values(Object.entries(ids).map(([name, id]) => ({
    id, name, email: `${name}@example.test`, handle: name, passwordHash,
    role: name === "operator" ? "platform_admin" as const : "member" as const,
  })));
});
afterAll(async () => { await client.end({ timeout: 5 }); });

async function privateCommunity() {
  const response = await call("/communities", tokens.owner, "POST", { name: "Private group", description: "not for strangers", isPrivate: true });
  expect(response.status).toBe(201);
  const result = await response.json() as { id: string; membersList: unknown[] };
  expect(result.membersList).toHaveLength(1);
  return result.id;
}

describe("API authorization and contracts against PostgreSQL", () => {
  it("starts without catalog/schema name collisions and marks liveness honestly", async () => {
    const health = await call("/health");
    expect(await health.json()).toMatchObject({ ok: true, check: "liveness" });
    expect(health.headers.get("cache-control")).toContain("no-store");
    expect((await call("/products")).status).toBe(200);
  });

  it("blocks anonymous uploads and rejects unsupported media", async () => {
    expect((await call("/upload/presign", undefined, "POST", { name: "file" })).status).toBe(401);
    expect((await call("/upload/presign", tokens.owner, "POST", { name: "x.svg", contentType: "image/svg+xml", size: 100 })).status).toBe(400);
    const upload = await call("/upload/presign", tokens.owner, "POST", { name: "photo.jpg", contentType: "image/jpeg", size: 100 });
    expect(upload.status).toBe(200);
    const result = await upload.json() as { key: string; url: string; publicUrl?: string };
    expect(result.key.startsWith(`uploads/${ids.owner}/`)).toBe(true);
    expect(new URL(result.url).origin).toBe(process.env.S3_PUBLIC_ENDPOINT);
    expect(result.publicUrl).toBeUndefined();
  });

  it("blocks both reading and sending to a non-member's conversation", async () => {
    const [conversation] = await db.insert(conversations).values({ name: "Private chat" }).returning();
    await db.insert(conversationMembers).values({ conversationId: conversation.id, userId: ids.owner });
    await db.insert(messages).values({ conversationId: conversation.id, senderId: ids.owner, text: "private message" });
    const path = `/chat/${conversation.id}/messages`;
    expect((await call(path, tokens.alice)).status).toBe(404);
    expect((await call(path, tokens.alice, "POST", { text: "intrusion" })).status).toBe(404);
    expect((await call(path, tokens.owner)).status).toBe(200);
    expect((await db.select().from(messages))).toHaveLength(1);
  });

  it("does not expose private community metadata or details to outsiders", async () => {
    const id = await privateCommunity();
    expect(await (await call("/communities", tokens.alice)).json()).toEqual([]);
    expect((await call(`/communities/${id}`, tokens.alice)).status).toBe(404);
    expect((await call(`/communities/${id}/invites`, tokens.alice, "POST")).status).toBe(403);
    expect((await call(`/communities/${id}`, tokens.owner)).status).toBe(200);
  });

  it("redeems a one-use invite atomically under parallel requests", async () => {
    const id = await privateCommunity();
    const invitation = await (await call(`/communities/${id}/invites`, tokens.owner, "POST")).json() as { code: string };
    const [stored] = await db.select().from(invites);
    expect(stored.code).not.toBe(invitation.code);
    const results = await Promise.all([
      call("/communities/join", tokens.alice, "POST", invitation),
      call("/communities/join", tokens.bob, "POST", invitation),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([200, 404]);
    expect((await db.select().from(communityMembers).where(eq(communityMembers.communityId, id)))).toHaveLength(2);
    expect((await db.select().from(invites))[0].uses).toBe(1);
    const successful = results.find((response) => response.status === 200)!;
    expect((await successful.json() as { membersList: unknown[] }).membersList).toHaveLength(2);
  });

  it("rejects expired invites and does not consume one for an existing member", async () => {
    const id = await privateCommunity();
    const invitation = await (await call(`/communities/${id}/invites`, tokens.owner, "POST")).json() as { code: string };
    expect((await call("/communities/join", tokens.owner, "POST", invitation)).status).toBe(200);
    expect((await db.select().from(invites))[0].uses).toBe(0);
    await db.update(invites).set({ expiresAt: new Date(0) });
    expect((await call("/communities/join", tokens.alice, "POST", invitation)).status).toBe(404);
  });

  it("keeps the last community admin even with competing demotions", async () => {
    const id = await privateCommunity();
    const path = `/communities/${id}/members/${ids.owner}/role`;
    expect((await call(path, tokens.owner, "PATCH", { role: "member" })).status).toBe(409);
    await db.insert(communityMembers).values({ communityId: id, userId: ids.alice, role: "admin" });
    const results = await Promise.all([
      call(path, tokens.owner, "PATCH", { role: "member" }),
      call(`/communities/${id}/members/${ids.alice}/role`, tokens.alice, "PATCH", { role: "member" }),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([200, 409]);
    expect((await db.select().from(communityMembers)).filter((m) => m.role === "admin")).toHaveLength(1);
  });

  it("does not trust the old admin role in a still-valid JWT", async () => {
    expect((await call("/admin/stats", tokens.owner)).status).toBe(403);
    expect((await call("/admin/stats", tokens.operator)).status).toBe(200);
    expect((await call(`/admin/users/${ids.operator}/role`, tokens.operator, "PATCH", { role: "member" })).status).toBe(409);
    await db.update(users).set({ role: "member" }).where(eq(users.id, ids.operator));
    expect((await call("/admin/users", tokens.operator)).status).toBe(403);
  });

  it("returns admin content as an array and removes dependent likes transactionally", async () => {
    const [post] = await db.insert(posts).values({ userId: ids.owner, text: "moderation example" }).returning();
    await db.insert(postLikes).values({ userId: ids.alice, postId: post.id });
    const content = await (await call("/admin/content", tokens.operator)).json();
    expect(Array.isArray(content)).toBe(true);
    expect((await call(`/admin/posts/${post.id}`, tokens.operator, "DELETE")).status).toBe(200);
    expect(await db.select().from(postLikes)).toHaveLength(0);
  });

  it("normalizes account emails and exposes an explicit non-admin role", async () => {
    const signup = await call("/auth/register", undefined, "POST", { name: "New grower", email: "NEW@example.test", password: "password-long-enough" });
    expect(signup.status).toBe(201);
    expect(await signup.json()).toMatchObject({ user: { role: "member" } });
    const login = await call("/auth/login", undefined, "POST", { email: "new@example.test", password: "password-long-enough" });
    expect(login.status).toBe(200);
  });

  it("keeps tasks private per user and validates input", async () => {
    expect((await call("/tasks", undefined)).status).toBe(401);
    expect((await call("/tasks", tokens.alice, "POST", { title: "", when: "Heute", prio: "hoch" })).status).toBe(400);
    expect((await call("/tasks", tokens.alice, "POST", { title: "x", when: "Heute", prio: "hoch", userId: ids.bob })).status).toBe(400);
    const created = await call("/tasks", tokens.alice, "POST", { title: "Komposttee", when: "Heute", prio: "hoch" });
    expect(created.status).toBe(201);
    const task = await created.json() as { id: string; done: boolean; grow: string };
    expect(task).toMatchObject({ done: false, grow: "Allgemein" });
    expect(await (await call("/tasks", tokens.bob)).json()).toEqual([]);
    expect((await call(`/tasks/${task.id}/toggle`, tokens.bob, "POST")).status).toBe(404);
    const toggled = await call(`/tasks/${task.id}/toggle`, tokens.alice, "POST");
    expect(await toggled.json()).toMatchObject({ id: task.id, done: true });
    expect((await call("/tasks/not-a-uuid/toggle", tokens.alice, "POST")).status).toBe(400);
  });

  it("lets signed-in users add community strains and wiki drafts, not anonymous visitors", async () => {
    const strain = { name: "QA Haze", breeder: "QA Seeds", type: "Sativa", thc: 21, cbd: 0.4, flowering: 10, yield: "500 g", difficulty: 2, price: 25, notes: "", effects: ["Kreativ"] };
    expect((await call("/strains", undefined, "POST", strain)).status).toBe(401);
    expect((await call("/strains", tokens.alice, "POST", { ...strain, thc: 99 })).status).toBe(400);
    const s = await call("/strains", tokens.alice, "POST", strain);
    expect(s.status).toBe(201);
    expect(await s.json()).toMatchObject({ name: "QA Haze", tag: "Community", color: "info", rating: 0 });
    expect((await (await call("/strains")).json() as { name: string }[]).some((x) => x.name === "QA Haze")).toBe(true);

    const article = { title: "VPD in der Blüte", category: "Klima", body: ["Absatz eins mit genug Inhalt für den Test.", "Absatz zwei."], tags: ["VPD"] };
    expect((await call("/wiki", undefined, "POST", article)).status).toBe(401);
    expect((await call("/wiki", tokens.alice, "POST", { ...article, body: ["zu kurz"] })).status).toBe(400);
    const w = await call("/wiki", tokens.alice, "POST", article);
    expect(w.status).toBe(201);
    const created = await w.json() as { id: string; author: string; version: string };
    expect(created).toMatchObject({ author: "alice", version: "0.1" });
    expect((await call(`/wiki/${created.id}`)).status).toBe(200);
  });

  it("stores images in PostgreSQL with magic-byte checks and serves them safely", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const upload = (body: Uint8Array, token?: string, type = "image/png") => app.request("/media", {
      method: "POST", body, headers: { "Content-Type": type, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    expect((await upload(png)).status).toBe(401);
    expect((await upload(svg, tokens.alice, "image/png")).status).toBe(415); // Header lügt → Magic Bytes entscheiden
    expect((await upload(new Uint8Array(2 * 1024 * 1024 + 1).fill(0xff), tokens.alice)).status).toBe(413);
    const ok = await upload(png, tokens.alice);
    expect(ok.status).toBe(201);
    const { path } = await ok.json() as { path: string };
    expect(path).toMatch(/^\/media\/[0-9a-f-]{36}$/);
    const served = await call(path);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");
    expect(served.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(png);
    expect((await call(path, tokens.bob, "DELETE")).status).toBe(404);
    expect((await call(path, tokens.alice, "DELETE")).status).toBe(200);
    expect(await db.select().from(media)).toHaveLength(0);
  });

  it("attaches uploads to own grows, chat messages and posts only", async () => {
    const [grow] = await db.insert(grows).values({ userId: ids.alice, name: "Alice Grow", breeder: "QA", medium: "Erde", startDate: "2026-01-01" }).returning();
    const ref = `/media/${randomUUID()}`;
    expect((await call(`/grows/${grow.id}/photos`, tokens.bob, "POST", { url: ref })).status).toBe(404);
    expect((await call(`/grows/${grow.id}/photos`, tokens.alice, "POST", { url: "javascript:alert(1)" })).status).toBe(400);
    expect((await call(`/grows/${grow.id}/photos`, tokens.alice, "POST", { url: "http://insecure.example/x.jpg" })).status).toBe(400);
    const added = await call(`/grows/${grow.id}/photos`, tokens.alice, "POST", { url: ref });
    expect(added.status).toBe(201);
    expect(await added.json()).toMatchObject({ gallery: [ref] });

    const [conversation] = await db.insert(conversations).values({ name: "Pics" }).returning();
    await db.insert(conversationMembers).values({ conversationId: conversation.id, userId: ids.alice });
    expect((await call(`/chat/${conversation.id}/messages`, tokens.alice, "POST", { text: "" })).status).toBe(400);
    const msg = await call(`/chat/${conversation.id}/messages`, tokens.alice, "POST", { image: ref });
    expect(await msg.json()).toMatchObject({ image: ref, text: "" });
    expect((await call("/social/posts", tokens.alice, "POST", { text: "Foto", image: ref })).status).toBe(201);
  });

  it("lets users edit their own profile without escalating privileges", async () => {
    expect((await call("/auth/me", undefined, "PATCH", { name: "x" })).status).toBe(401);
    expect((await call("/auth/me", tokens.alice, "PATCH", { role: "platform_admin" })).status).toBe(400);
    const updated = await call("/auth/me", tokens.alice, "PATCH", { name: "Alice Grün", title: "Soil Nerd", avatar: `/media/${randomUUID()}` });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ name: "Alice Grün", title: "Soil Nerd", role: "member" });
    expect(await (await call("/auth/me", tokens.alice, "PATCH", { avatar: "" })).json()).toMatchObject({ avatar: "" });
  });

  it("keeps a personal strain collection per user", async () => {
    const [strain] = await db.insert(strains).values({ name: "Collect Kush", breederName: "QA" }).returning();
    expect((await call(`/strains/${strain.id}/collect`, undefined, "POST")).status).toBe(401);
    expect(await (await call(`/strains/${strain.id}/collect`, tokens.alice, "POST")).json()).toEqual({ collected: true });
    expect((await (await call("/strains/collection", tokens.alice)).json() as { id: string }[]).map((s) => s.id)).toEqual([strain.id]);
    expect(await (await call("/strains/collection", tokens.bob)).json()).toEqual([]);
    expect(await (await call(`/strains/${strain.id}/collect`, tokens.alice, "POST")).json()).toEqual({ collected: false });
    expect((await call(`/strains/${randomUUID()}/collect`, tokens.alice, "POST")).status).toBe(404);
  });

  it("toggles forum votes, reports the own vote and supports threaded replies with comment votes", async () => {
    const [sub] = await db.insert(subs).values({ name: "QA" }).returning();
    const [thread] = await db.insert(threads).values({ subId: sub.id, userId: ids.owner, title: "Vote me", body: "Body text" }).returning();
    const vote = (token: string, delta: number) => call(`/forum/threads/${thread.id}/vote`, token, "POST", { delta });
    expect(await (await vote(tokens.alice, 1)).json()).toEqual({ votes: 1, myVote: 1 });
    expect(await (await vote(tokens.bob, -1)).json()).toEqual({ votes: 0, myVote: -1 });
    expect(await (await vote(tokens.alice, 0)).json()).toEqual({ votes: -1, myVote: 0 });
    expect((await vote(tokens.alice, 2)).status).toBe(400);
    const list = await (await call("/forum/threads", tokens.bob)).json() as { id: string; myVote: number; votes: number }[];
    expect(list.find((t) => t.id === thread.id)).toMatchObject({ myVote: -1, votes: -1 });
    expect((await (await call("/forum/threads")).json() as { myVote: number }[])[0].myVote).toBe(0); // anonym

    const root = await (await call(`/forum/threads/${thread.id}/comments`, tokens.alice, "POST", { text: "Wurzel" })).json() as { id: string };
    const reply = await call(`/forum/threads/${thread.id}/comments`, tokens.bob, "POST", { text: "Antwort", parentId: root.id });
    expect(reply.status).toBe(201);
    expect((await call(`/forum/threads/${thread.id}/comments`, tokens.bob, "POST", { text: "x", parentId: randomUUID() })).status).toBe(404);
    expect(await (await call(`/forum/comments/${root.id}/vote`, tokens.bob, "POST", { delta: 1 })).json()).toEqual({ votes: 1, myVote: 1 });
    expect((await call(`/forum/comments/${root.id}/vote`, undefined, "POST", { delta: 1 })).status).toBe(401);
    const detail = await (await call(`/forum/threads/${thread.id}`, tokens.bob)).json() as { body: string; commentsList: { votes: number; myVote: number; replies: { body: string }[] }[] };
    expect(detail.body).toBe("Body text");
    expect(detail.commentsList[0]).toMatchObject({ votes: 1, myVote: 1, replies: [{ body: "Antwort" }] });
  });

  it("stores comments on hall entries and social posts with real counts", async () => {
    const [entry] = await db.insert(hallEntries).values({ title: "Hall", grower: "g", strain: "s", imageUrl: "https://x.test/a.jpg", award: "A", likes: 0, comments: 99, aspect: "aspect-square" }).returning();
    expect((await call(`/hall/${entry.id}/comments`, undefined, "POST", { text: "anon" })).status).toBe(401);
    expect((await call(`/hall/${entry.id}/comments`, tokens.alice, "POST", { text: "" })).status).toBe(400);
    expect((await call(`/hall/${entry.id}/comments`, tokens.alice, "POST", { text: "Wow!" })).status).toBe(201);
    expect(await (await call(`/hall/${entry.id}/comments`)).json()).toMatchObject([{ author: "alice", body: "Wow!" }]);
    expect((await (await call("/hall")).json() as { id: string; comments: number }[]).find((h) => h.id === entry.id)?.comments).toBe(1);
    expect((await call(`/hall/${randomUUID()}/comments`, tokens.alice, "POST", { text: "x" })).status).toBe(404);

    const [post] = await db.insert(posts).values({ userId: ids.owner, text: "Post" }).returning();
    expect((await call(`/social/posts/${post.id}/comments`, tokens.bob, "POST", { text: "Nice" })).status).toBe(201);
    expect(await (await call(`/social/posts/${post.id}/comments`, tokens.alice)).json()).toMatchObject([{ author: "bob", body: "Nice" }]);
    expect((await (await call("/social/posts", tokens.alice)).json() as { id: string; comments: number }[]).find((p) => p.id === post.id)?.comments).toBe(1);
  });

  it("applies global feature flags to every user and enforces them on the server", async () => {
    const { invalidateFeatureCache } = await import("../src/lib/features.ts");
    await db.execute(sql`DELETE FROM feature_flags`);
    invalidateFeatureCache();
    expect(await (await call("/features")).json()).toEqual({ overrides: {} });
    expect((await call("/admin/features/forum", tokens.alice, "PUT", { enabled: false })).status).toBe(403);
    expect((await call("/admin/features/dashboard", tokens.operator, "PUT", { enabled: false })).status).toBe(409);
    expect((await call("/admin/features/nope", tokens.operator, "PUT", { enabled: false })).status).toBe(404);
    expect((await call("/admin/features/forum", tokens.operator, "PUT", { enabled: "no" })).status).toBe(400);

    const off = await call("/admin/features/forum", tokens.operator, "PUT", { enabled: false });
    expect(await off.json()).toEqual({ overrides: { forum: false } });
    // Anderer Nutzer, anderes Gerät: sieht den Override und wird serverseitig gesperrt.
    expect(await (await call("/features")).json()).toEqual({ overrides: { forum: false } });
    const blocked = await call("/forum/threads", tokens.alice);
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toMatchObject({ feature: "forum" });
    expect((await call("/social/posts", tokens.alice)).status).toBe(200); // andere Features unberührt

    expect(await (await call("/admin/features", tokens.operator, "DELETE")).json()).toEqual({ overrides: {} });
    expect((await call("/forum/threads", tokens.alice)).status).toBe(200);
  });

  it("publishes release notes for everyone and restricts publishing to platform admins", async () => {
    await db.execute(sql`DELETE FROM app_releases`);
    const release = { version: "1.2.0", title: "Neues Forum", notes: ["Votes", "Antworten"], severity: "recommended", features: ["forum"] };
    expect((await call("/admin/releases", tokens.alice, "POST", release)).status).toBe(403);
    expect((await call("/admin/releases", tokens.operator, "POST", { ...release, features: ["nope"] })).status).toBe(400);
    expect((await call("/admin/releases", tokens.operator, "POST", { ...release, notes: [] })).status).toBe(400);
    expect((await call("/admin/releases", tokens.operator, "POST", { ...release, severity: "critical" })).status).toBe(400);
    const first = await (await call("/admin/releases", tokens.operator, "POST", release)).json() as { id: string };
    await call("/admin/releases", tokens.operator, "POST", { ...release, version: "1.3.0", severity: "required" });
    const list = await (await call("/releases")).json() as { version: string; severity: string; features: string[] }[];
    expect(list.map((r) => r.version)).toEqual(["1.3.0", "1.2.0"]); // neueste zuerst, öffentlich
    expect(list[1]).toMatchObject({ severity: "recommended", features: ["forum"] });
    expect((await call(`/admin/releases/${first.id}`, tokens.alice, "DELETE")).status).toBe(403);
    expect((await call(`/admin/releases/${first.id}`, tokens.operator, "DELETE")).status).toBe(200);
    expect(await (await call("/releases")).json()).toHaveLength(1);
  });
});

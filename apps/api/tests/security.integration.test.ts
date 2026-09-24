import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { app } from "../src/app.js";
import { client, db } from "../src/db/client.js";
import { communities, communityMembers, conversationMembers, conversations, invites, messages, postLikes, posts, users } from "../src/db/schema.js";
import { signToken } from "../src/lib/jwt.js";
import { hashPassword } from "../src/lib/password.js";

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
  await db.execute(sql`TRUNCATE TABLE users, communities, conversations, subs RESTART IDENTITY CASCADE`);
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
});
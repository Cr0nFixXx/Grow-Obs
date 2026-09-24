import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { and, count, desc, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { communities, communityMembers, invites, users } from "../db/schema";
import { requireAuth, type AuthEnv } from "../middleware/auth";

export const communitiesApi = new Hono<AuthEnv>();
communitiesApi.use("*", requireAuth);

async function toCommunity(id: string, viewerId: string) {
  const c = await db.query.communities.findFirst({ where: eq(communities.id, id) });
  if (!c) return null;
  const [n] = await db.select({ n: count() }).from(communityMembers).where(eq(communityMembers.communityId, id));
  const membership = await db.query.communityMembers.findFirst({
    where: and(eq(communityMembers.communityId, id), eq(communityMembers.userId, viewerId)),
  });
  return {
    id: c.id, name: c.name, description: c.description, isPrivate: c.isPrivate,
    members: n.n, role: membership?.role, joined: !!membership, createdAt: c.createdAt.toISOString(),
  };
}

communitiesApi.get("/", async (c) => {
  const rows = await db.select().from(communities).orderBy(desc(communities.createdAt));
  return c.json(await Promise.all(rows.map((row) => toCommunity(row.id, c.get("userId")))));
});

communitiesApi.get("/:id", async (c) => {
  const base = await toCommunity(c.req.param("id"), c.get("userId"));
  if (!base) return c.json({ error: "Nicht gefunden" }, 404);
  if (base.isPrivate && !base.joined) return c.json({ error: "Forbidden" }, 403);
  const rows = await db
    .select({ id: users.id, name: users.name, handle: users.handle, avatar: users.avatarUrl, role: communityMembers.role })
    .from(communityMembers)
    .innerJoin(users, eq(users.id, communityMembers.userId))
    .where(eq(communityMembers.communityId, c.req.param("id")));
  return c.json({ ...base, membersList: rows.map((m) => ({ ...m, avatar: m.avatar ?? "" })) });
});

const createSchema = z.object({ name: z.string().min(2), description: z.string().default(""), isPrivate: z.boolean().default(false) });
communitiesApi.post("/", async (c) => {
  const body = createSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  const [row] = await db.insert(communities).values({ ...body.data, createdBy: c.get("userId") }).returning();
  await db.insert(communityMembers).values({ communityId: row.id, userId: c.get("userId"), role: "admin" });
  return c.json(await toCommunity(row.id, c.get("userId")), 201);
});

communitiesApi.post("/:id/join", async (c) => {
  const row = await db.query.communities.findFirst({ where: eq(communities.id, c.req.param("id")) });
  if (!row) return c.json({ error: "Nicht gefunden" }, 404);
  if (row.isPrivate) return c.json({ error: "Einladung erforderlich" }, 403);
  await db.insert(communityMembers).values({ communityId: row.id, userId: c.get("userId") }).onConflictDoNothing();
  return c.json({ ok: true });
});

communitiesApi.post("/:id/invites", async (c) => {
  const membership = await db.query.communityMembers.findFirst({
    where: and(eq(communityMembers.communityId, c.req.param("id")), eq(communityMembers.userId, c.get("userId"))),
  });
  if (!membership || membership.role !== "admin") return c.json({ error: "Forbidden" }, 403);
  const code = `go-inv_${randomBytes(6).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + 86400000);
  await db.insert(invites).values({ communityId: c.req.param("id"), code, expiresAt });
  return c.json({ code, expiresAt: expiresAt.toISOString() }, 201);
});

const joinSchema = z.object({ code: z.string().min(1) });
communitiesApi.post("/join", async (c) => {
  const body = joinSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültiger Code" }, 400);
  const invite = await db.query.invites.findFirst({
    where: and(eq(invites.code, body.data.code), gt(invites.expiresAt, new Date()), sql`${invites.uses} < ${invites.maxUses}`),
  });
  if (!invite) return c.json({ error: "Einladung ungültig oder abgelaufen" }, 404);
  await db.insert(communityMembers).values({ communityId: invite.communityId, userId: c.get("userId") }).onConflictDoNothing();
  await db.update(invites).set({ uses: sql`${invites.uses} + 1` }).where(eq(invites.id, invite.id));
  return c.json(await toCommunity(invite.communityId, c.get("userId")));
});

const roleSchema = z.object({ role: z.enum(["member", "moderator", "admin"]) });
communitiesApi.patch("/:id/members/:userId/role", async (c) => {
  const admin = await db.query.communityMembers.findFirst({
    where: and(eq(communityMembers.communityId, c.req.param("id")), eq(communityMembers.userId, c.get("userId"))),
  });
  if (!admin || admin.role !== "admin") return c.json({ error: "Forbidden" }, 403);
  const body = roleSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültige Rolle" }, 400);
  await db.update(communityMembers).set({ role: body.data.role }).where(and(eq(communityMembers.communityId, c.req.param("id")), eq(communityMembers.userId, c.req.param("userId"))));
  return c.json({ ok: true });
});
import { createHash, randomBytes } from "node:crypto";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, count, desc, eq, exists, gt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import { communities, communityBans, communityMembers, invites, reports, users } from "../db/schema.ts";
import { requireAuth, type AuthEnv } from "../middleware/auth.ts";
import { pageLimit, uuid } from "../lib/validation.ts";
import { createNotification } from "../lib/notify.ts";
import { moderationApi } from "./moderation.ts";

export const communitiesApi = new Hono<AuthEnv>();
communitiesApi.use("*", requireAuth);
// Moderation (B-61): Beiträge/Kommentare ausblenden, Meldungen, Warteschlange.
communitiesApi.route("/", moderationApi);

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// A single lock order (community, then invite/member) serializes all membership changes.
async function lockCommunity(tx: Transaction, id: string) {
  const [community] = await tx.select().from(communities).where(eq(communities.id, id)).for("update");
  if (!community) throw new HTTPException(404, { message: "Community nicht gefunden" });
  return community;
}

async function assertNotBanned(tx: Transaction, communityId: string, userId: string) {
  const [ban] = await tx.select().from(communityBans)
    .where(and(eq(communityBans.communityId, communityId), eq(communityBans.userId, userId)));
  if (ban) throw new HTTPException(403, { message: "Du wurdest aus dieser Community gesperrt" });
}

async function requireCommunityAdmin(tx: Transaction, id: string, userId: string) {
  const [member] = await tx.select().from(communityMembers)
    .where(and(eq(communityMembers.communityId, id), eq(communityMembers.userId, userId)));
  if (member?.role !== "admin") throw new HTTPException(403, { message: "Keine Berechtigung" });
}

async function toCommunity(id: string, viewerId: string) {
  const c = await db.query.communities.findFirst({ where: eq(communities.id, id) });
  if (!c) return null;
  const [n] = await db.select({ n: count() }).from(communityMembers).where(eq(communityMembers.communityId, id));
  const membership = await db.query.communityMembers.findFirst({
    where: and(eq(communityMembers.communityId, id), eq(communityMembers.userId, viewerId)),
  });
  if (c.isPrivate && !membership) return null;
  return {
    id: c.id, name: c.name, description: c.description, isPrivate: c.isPrivate,
    members: n.n, role: membership?.role, joined: !!membership, createdAt: c.createdAt.toISOString(),
  };
}

async function toDetail(id: string, viewerId: string) {
  const base = await toCommunity(id, viewerId);
  if (!base) throw new HTTPException(404, { message: "Community nicht gefunden" });
  // Public discovery exposes counts, not a list of member identities to outsiders.
  const rows = base.joined ? await db
    .select({ id: users.id, name: users.name, handle: users.handle, avatar: users.avatarUrl, role: communityMembers.role })
    .from(communityMembers).innerJoin(users, eq(users.id, communityMembers.userId))
    .where(eq(communityMembers.communityId, id)) : [];
  // Offene Meldungen nur für die Moderation (Badge am Reiter „Moderation“).
  let openReports: number | undefined;
  if (base.role === "moderator" || base.role === "admin") {
    const [n] = await db.select({ n: count() }).from(reports).where(and(eq(reports.communityId, id), eq(reports.status, "open")));
    openReports = n.n;
  }
  return { ...base, ...(openReports === undefined ? {} : { openReports }), membersList: rows.map((member) => ({ ...member, avatar: member.avatar ?? "" })) };
}

communitiesApi.get("/", async (c) => {
  const viewerId = c.get("userId");
  const membership = db.select({ id: communityMembers.communityId }).from(communityMembers)
    .where(and(eq(communityMembers.communityId, communities.id), eq(communityMembers.userId, viewerId)));
  const rows = await db.select().from(communities)
    .where(or(eq(communities.isPrivate, false), exists(membership)))
    .orderBy(desc(communities.createdAt)).limit(pageLimit(c.req.query("limit")));
  return c.json((await Promise.all(rows.map((row) => toCommunity(row.id, viewerId)))).filter(Boolean));
});

communitiesApi.get("/:id", async (c) => {
  return c.json(await toDetail(uuid(c.req.param("id")), c.get("userId")));
});

const createSchema = z.object({ name: z.string().trim().min(2).max(100), description: z.string().trim().max(2000).default(""), isPrivate: z.boolean().default(false) });
communitiesApi.post("/", async (c) => {
  const body = createSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  const id = await db.transaction(async (tx) => {
    const [row] = await tx.insert(communities).values({ ...body.data, createdBy: c.get("userId") })
      .onConflictDoNothing().returning();
    if (!row) throw new HTTPException(409, { message: "Name bereits vergeben" });
    await tx.insert(communityMembers).values({ communityId: row.id, userId: c.get("userId"), role: "admin" });
    return row.id;
  });
  return c.json(await toDetail(id, c.get("userId")), 201);
});

communitiesApi.post("/:id/join", async (c) => {
  const id = uuid(c.req.param("id"));
  await db.transaction(async (tx) => {
    const row = await lockCommunity(tx, id);
    if (row.isPrivate) throw new HTTPException(404, { message: "Community nicht gefunden" });
    await assertNotBanned(tx, id, c.get("userId"));
    await tx.insert(communityMembers).values({ communityId: id, userId: c.get("userId") }).onConflictDoNothing();
  });
  return c.json({ ok: true });
});

communitiesApi.post("/:id/invites", async (c) => {
  const id = uuid(c.req.param("id"));
  const code = `go-inv_${randomBytes(24).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + 86400000);
  await db.transaction(async (tx) => {
    await lockCommunity(tx, id);
    await requireCommunityAdmin(tx, id, c.get("userId"));
    await tx.insert(invites).values({ communityId: id, code: createHash("sha256").update(code).digest("hex"), expiresAt });
  });
  return c.json({ code, expiresAt: expiresAt.toISOString() }, 201);
});

const joinSchema = z.object({ code: z.string().trim().regex(/^go-inv_[A-Za-z0-9_-]{32}$/) });
communitiesApi.post("/join", async (c) => {
  const body = joinSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültiger Code" }, 400);
  const hash = createHash("sha256").update(body.data.code).digest("hex");
  const id = await db.transaction(async (tx) => {
    const [candidate] = await tx.select().from(invites).where(eq(invites.code, hash));
    if (!candidate) throw new HTTPException(404, { message: "Einladung ungueltig oder abgelaufen" });
    await lockCommunity(tx, candidate.communityId);
    const [invite] = await tx.select().from(invites).where(and(
      eq(invites.id, candidate.id), gt(invites.expiresAt, new Date()), sql`${invites.uses} < ${invites.maxUses}`,
    )).for("update");
    if (!invite) throw new HTTPException(404, { message: "Einladung ungueltig oder abgelaufen" });
    await assertNotBanned(tx, invite.communityId, c.get("userId"));
    const joined = await tx.insert(communityMembers)
      .values({ communityId: invite.communityId, userId: c.get("userId") }).onConflictDoNothing().returning();
    // Existing members do not consume a new invitation.
    if (joined.length) await tx.update(invites).set({ uses: sql`${invites.uses} + 1` }).where(eq(invites.id, invite.id));
    return invite.communityId;
  });
  return c.json(await toDetail(id, c.get("userId")));
});

const roleSchema = z.object({ role: z.enum(["member", "moderator", "admin"]) });
communitiesApi.patch("/:id/members/:userId/role", async (c) => {
  const id = uuid(c.req.param("id"));
  const userId = uuid(c.req.param("userId"));
  const body = roleSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültige Rolle" }, 400);
  await db.transaction(async (tx) => {
    await lockCommunity(tx, id);
    await requireCommunityAdmin(tx, id, c.get("userId"));
    const targetWhere = and(eq(communityMembers.communityId, id), eq(communityMembers.userId, userId));
    const [target] = await tx.select().from(communityMembers).where(targetWhere);
    if (!target) throw new HTTPException(404, { message: "Mitglied nicht gefunden" });
    if (target.role === "admin" && body.data.role !== "admin") {
      const [admins] = await tx.select({ n: count() }).from(communityMembers)
        .where(and(eq(communityMembers.communityId, id), eq(communityMembers.role, "admin")));
      if (admins.n <= 1) throw new HTTPException(409, { message: "Die letzte Admin-Rolle darf nicht entfernt werden" });
    }
    await tx.update(communityMembers).set({ role: body.data.role }).where(targetWhere);
  });
  return c.json({ ok: true });
});

/** Rauswurf (B-61): Moderatoren entfernen Mitglieder, Admins auch Moderatoren; Admins bleiben (erst herabstufen). Optional dauerhaft sperren. */
const kickSchema = z.object({ ban: z.boolean().default(false) });
communitiesApi.delete("/:id/members/:userId", async (c) => {
  const id = uuid(c.req.param("id"));
  const userId = uuid(c.req.param("userId"));
  const body = kickSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültige Daten" }, 400);
  // Browser-Clients senden `?ban=true` (DELETE ohne Body); der JSON-Body bleibt für andere Clients erlaubt.
  const ban = body.data.ban || c.req.query("ban") === "true";
  const actorId = c.get("userId");
  const name = await db.transaction(async (tx) => {
    const community = await lockCommunity(tx, id);
    const [actor] = await tx.select().from(communityMembers)
      .where(and(eq(communityMembers.communityId, id), eq(communityMembers.userId, actorId)));
    if (actor?.role !== "admin" && actor?.role !== "moderator") throw new HTTPException(403, { message: "Keine Berechtigung" });
    if (userId === actorId) throw new HTTPException(400, { message: "Du kannst dich nicht selbst entfernen" });
    const targetWhere = and(eq(communityMembers.communityId, id), eq(communityMembers.userId, userId));
    const [target] = await tx.select().from(communityMembers).where(targetWhere);
    if (!target) throw new HTTPException(404, { message: "Mitglied nicht gefunden" });
    if (target.role === "admin") throw new HTTPException(409, { message: "Admins können nicht entfernt werden – zuerst die Rolle ändern" });
    if (actor.role === "moderator" && target.role !== "member") throw new HTTPException(403, { message: "Moderatoren können nur Mitglieder entfernen" });
    await tx.delete(communityMembers).where(targetWhere);
    if (ban) await tx.insert(communityBans).values({ communityId: id, userId, bannedBy: actorId }).onConflictDoNothing();
    return community.name;
  });
  await createNotification(userId, {
    type: "system",
    title: `Du wurdest aus „${name}“ entfernt`,
    body: ban ? "Du bist für diese Community gesperrt." : "Du kannst ihr gegebenenfalls erneut beitreten.",
  }).catch(() => undefined);
  return c.json({ ok: true });
});

/**
 * Community verlassen (B-89). Jedes Mitglied darf gehen. Der alleinige Admin muss erst einen weiteren Admin ernennen
 * (409), das letzte Mitglied kann nicht gehen (409) – sonst bliebe eine Community ohne Admin zurück. Kein Eintrag in die Sperrliste.
 */
communitiesApi.post("/:id/leave", async (c) => {
  const id = uuid(c.req.param("id"));
  const userId = c.get("userId");
  await db.transaction(async (tx) => {
    await lockCommunity(tx, id);
    const mine = and(eq(communityMembers.communityId, id), eq(communityMembers.userId, userId));
    const [me] = await tx.select().from(communityMembers).where(mine);
    if (!me) throw new HTTPException(404, { message: "Du bist kein Mitglied dieser Community" });
    const others = await tx.select({ role: communityMembers.role }).from(communityMembers)
      .where(and(eq(communityMembers.communityId, id), ne(communityMembers.userId, userId)));
    if (others.length === 0) throw new HTTPException(409, { message: "Du bist das letzte Mitglied – die Community kann so nicht verlassen werden." });
    if (me.role === "admin" && !others.some((o) => o.role === "admin")) {
      throw new HTTPException(409, { message: "Du bist der einzige Admin. Ernenne zuerst ein anderes Mitglied zum Admin." });
    }
    await tx.delete(communityMembers).where(mine);
  });
  return c.json({ ok: true });
});

/** Sperrliste (nur Admins) und Entsperren. */
communitiesApi.get("/:id/bans", async (c) => {
  const id = uuid(c.req.param("id"));
  await db.transaction(async (tx) => { await requireCommunityAdmin(tx, id, c.get("userId")); });
  const rows = await db
    .select({ id: users.id, name: users.name, handle: users.handle, avatar: users.avatarUrl, bannedAt: communityBans.createdAt })
    .from(communityBans).innerJoin(users, eq(users.id, communityBans.userId))
    .where(eq(communityBans.communityId, id)).orderBy(desc(communityBans.createdAt)).limit(200);
  return c.json(rows.map((r) => ({ id: r.id, name: r.name, handle: r.handle, avatar: r.avatar ?? "", bannedAt: r.bannedAt.toISOString() })));
});

communitiesApi.delete("/:id/bans/:userId", async (c) => {
  const id = uuid(c.req.param("id"));
  const userId = uuid(c.req.param("userId"));
  await db.transaction(async (tx) => {
    await requireCommunityAdmin(tx, id, c.get("userId"));
    const removed = await tx.delete(communityBans)
      .where(and(eq(communityBans.communityId, id), eq(communityBans.userId, userId))).returning();
    if (!removed.length) throw new HTTPException(404, { message: "Keine Sperre gefunden" });
  });
  return c.json({ ok: true });
});

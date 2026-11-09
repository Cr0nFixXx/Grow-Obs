import { Hono } from "hono";
import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import { conversationInvites, conversationMembers, conversations, conversationTopics, messages, topicMembers, topicUserState, users } from "../db/schema.ts";
import { imageRef } from "../lib/media-ref.ts";
import { createNotification } from "../lib/notify.ts";
import {
  announceGroupChange, DEFAULT_TOPIC_NAME, groupUnreadByTopic, INVITE_TTL_MS, MAX_GROUP_MEMBERS, MAX_PENDING_INVITES_PER_USER, MAX_TOPICS,
  postSystemMessage, repairAfterDeparture, requireAdmin, requireGroup, requireTopic, canWrite, type Access, type TopicRow,
} from "../lib/chat-groups.ts";
import { uuid } from "../lib/validation.ts";
import type { AuthEnv } from "../middleware/auth.ts";
import { rateLimit, userKey } from "../middleware/rate-limit.ts";
import { onlineAmong, publish } from "../realtime/hub.ts";

/**
 * Gruppenchats (B-65): Gruppen, Einladungen, Mitglieder, Themen. Wird in `chat.ts` unter `/chat` eingehängt (Auth dort).
 * Regeln: Beitritt nur per Einladung mit Annahme; nur Admins laden ein, entfernen, benennen um und verwalten Themen;
 * alle dürfen gehen (ohne Admin wird das am längsten dabei seiende Mitglied Admin); höchstens 20 Mitglieder inkl. offener Einladungen.
 */
export const chatGroups = new Hono<AuthEnv>();

const name60 = z.string().trim().min(1).max(60);
const topicName = z.string().trim().min(1).max(40);
const emoji = z.string().trim().max(8);
const userIds = (max: number) => z.array(z.string().uuid()).max(max).transform((ids) => [...new Set(ids)]);
const bad = (c: { json: (b: unknown, s: 400) => Response }) => c.json({ error: "Ungültige Daten" }, 400);

async function nameOf(id: string): Promise<string> {
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, id)).limit(1);
  return u?.name ?? "Jemand";
}
const label = (t: Pick<TopicRow, "name" | "emoji">) => `${t.emoji ? `${t.emoji} ` : ""}${t.name}`;

/** Abgelaufene Einladungen schließen (sonst blockiert der Unique-Index für „offen“ ein erneutes Einladen). */
async function expireInvites(conversationId?: string): Promise<void> {
  await db.update(conversationInvites).set({ status: "expired" })
    .where(and(eq(conversationInvites.status, "pending"), sql`${conversationInvites.expiresAt} < now()`, conversationId ? eq(conversationInvites.conversationId, conversationId) : undefined));
}

/* ------------------------------------------------------------------ Detail */

async function groupDetail(access: Access, userId: string) {
  const { cv } = access;
  await expireInvites(cv.id);
  const allTopics = await db.select().from(conversationTopics).where(eq(conversationTopics.conversationId, cv.id)).orderBy(asc(conversationTopics.position), asc(conversationTopics.createdAt));
  const tm = allTopics.some((t) => t.isPrivate) ? await db.select().from(topicMembers).where(inArray(topicMembers.topicId, allTopics.filter((t) => t.isPrivate).map((t) => t.id))) : [];
  const mine = new Set(tm.filter((r) => r.userId === userId).map((r) => r.topicId));
  const unread = new Map((await groupUnreadByTopic(userId, [cv.id])).map((r) => [r.topicId, r]));
  const states = await db.select().from(topicUserState).where(and(eq(topicUserState.userId, userId), inArray(topicUserState.topicId, allTopics.map((t) => t.id))));
  const muted = new Set(states.filter((s) => s.muted).map((s) => s.topicId));
  const topics = allTopics.filter((t) => !t.isPrivate || access.isAdmin || mine.has(t.id)).sort((a, b) => Number(b.pinned) - Number(a.pinned))
    .map((t) => ({
      id: t.id, name: t.name, emoji: t.emoji, isDefault: t.isDefault, private: t.isPrivate, adminsOnly: t.adminsOnly, closed: t.closed, pinned: t.pinned,
      canWrite: canWrite(t, access.isAdmin), unread: unread.get(t.id)?.n ?? 0, muted: muted.has(t.id),
      memberIds: t.isPrivate && access.isAdmin ? tm.filter((r) => r.topicId === t.id).map((r) => r.userId) : undefined,
    }));
  const people = await db.select({ id: users.id, name: users.name, handle: users.handle, avatar: users.avatarUrl }).from(users).where(inArray(users.id, access.memberIds));
  const online = await onlineAmong(access.memberIds);
  const members = access.members.map((m) => {
    const p = people.find((x) => x.id === m.userId);
    return { id: m.userId, name: p?.name ?? "", handle: p?.handle ?? "", avatar: p?.avatar ?? "", role: m.role, online: online.has(m.userId), joinedAt: m.joinedAt.toISOString() };
  }).sort((a, b) => (a.role === b.role ? a.joinedAt.localeCompare(b.joinedAt) : a.role === "admin" ? -1 : 1));
  let invites: { id: string; userId: string; name: string; handle: string; avatar: string; invitedBy: string; expiresAt: string }[] = [];
  if (access.isAdmin) {
    const rows = await db.select({ inv: conversationInvites, name: users.name, handle: users.handle, avatar: users.avatarUrl }).from(conversationInvites)
      .innerJoin(users, eq(users.id, conversationInvites.inviteeId)).where(and(eq(conversationInvites.conversationId, cv.id), eq(conversationInvites.status, "pending"))).orderBy(asc(conversationInvites.createdAt));
    invites = rows.map((r) => ({ id: r.inv.id, userId: r.inv.inviteeId, name: r.name, handle: r.handle, avatar: r.avatar ?? "", invitedBy: r.inv.inviterId ?? "", expiresAt: r.inv.expiresAt.toISOString() }));
  }
  return { id: cv.id, meId: userId, name: cv.name, avatar: cv.avatarUrl ?? "", historyVisible: cv.historyVisible, role: access.me.role, memberCount: members.length, maxMembers: MAX_GROUP_MEMBERS, members, topics, invites, createdAt: cv.createdAt.toISOString() };
}

/* ------------------------------------------------------------------ Einladen */

type Skipped = { userId: string; reason: string };

/** Lädt Personen ein (Transaktion mit Sperre auf der Gruppe: Kapazität = Mitglieder + offene Einladungen ≤ 20). */
async function createInvites(access: Access, inviterId: string, ids: string[]): Promise<{ invited: string[]; skipped: Skipped[] }> {
  const { cv } = access;
  const skipped: Skipped[] = [];
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM conversations WHERE id = ${cv.id} FOR UPDATE`);
    await tx.update(conversationInvites).set({ status: "expired" }).where(and(eq(conversationInvites.status, "pending"), sql`${conversationInvites.expiresAt} < now()`));
    const existingUsers = new Set((await tx.select({ id: users.id }).from(users).where(and(inArray(users.id, ids), isNull(users.deletedAt)))).map((u) => u.id));
    const memberNow = new Set((await tx.select({ id: conversationMembers.userId }).from(conversationMembers).where(eq(conversationMembers.conversationId, cv.id))).map((m) => m.id));
    const pendingHere = new Set((await tx.select({ id: conversationInvites.inviteeId }).from(conversationInvites).where(and(eq(conversationInvites.conversationId, cv.id), eq(conversationInvites.status, "pending")))).map((r) => r.id));
    const candidates: string[] = [];
    for (const id of ids) {
      if (!existingUsers.has(id)) skipped.push({ userId: id, reason: "Person nicht gefunden" });
      else if (memberNow.has(id)) skipped.push({ userId: id, reason: "Ist schon Mitglied" });
      else if (pendingHere.has(id)) skipped.push({ userId: id, reason: "Bereits eingeladen" });
      else candidates.push(id);
    }
    const accepted: string[] = [];
    if (candidates.length) {
      const pendingCounts = await tx.select({ id: conversationInvites.inviteeId, n: count() }).from(conversationInvites)
        .where(and(inArray(conversationInvites.inviteeId, candidates), eq(conversationInvites.status, "pending"))).groupBy(conversationInvites.inviteeId);
      const busy = new Set(pendingCounts.filter((r) => r.n >= MAX_PENDING_INVITES_PER_USER).map((r) => r.id));
      for (const id of candidates) { if (busy.has(id)) skipped.push({ userId: id, reason: "Hat zu viele offene Einladungen" }); else accepted.push(id); }
    }
    if (memberNow.size + pendingHere.size + accepted.length > MAX_GROUP_MEMBERS) return { full: true as const, invited: [] as string[] };
    if (accepted.length) await tx.insert(conversationInvites).values(accepted.map((inviteeId) => ({ conversationId: cv.id, inviterId, inviteeId, expiresAt: new Date(Date.now() + INVITE_TTL_MS) })));
    return { full: false as const, invited: accepted };
  });
  if (result.full) return Promise.reject(Object.assign(new Error("Gruppe voll"), { full: true }));
  if (result.invited.length) {
    const inviter = await nameOf(inviterId);
    const names = (await db.select({ name: users.name }).from(users).where(inArray(users.id, result.invited))).map((u) => u.name);
    await postSystemMessage(access, inviterId, `${inviter} hat ${names.join(", ")} eingeladen`);
    for (const id of result.invited) {
      await createNotification(id, { type: "system", title: `Einladung zur Gruppe „${cv.name}“`, body: `${inviter} lädt dich ein.`, category: "messages", url: "/chat" });
    }
    await announceGroupChange(cv.id, access.memberIds, result.invited);
  }
  return { invited: result.invited, skipped };
}

const fullError = (c: { json: (b: unknown, s: 409) => Response }, e: unknown) => {
  if ((e as { full?: boolean }).full) return c.json({ error: `Gruppe voll (höchstens ${MAX_GROUP_MEMBERS} Mitglieder inklusive offener Einladungen)` }, 409);
  throw e;
};

/* ------------------------------------------------------------------ Gruppen */

chatGroups.post("/groups", rateLimit({ name: "chat-group-create", limit: 10, windowMs: 10 * 60_000, keys: userKey }), async (c) => {
  const me = c.get("userId");
  const body = z.object({ name: name60, avatar: imageRef.optional(), userIds: userIds(MAX_GROUP_MEMBERS - 1) }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return bad(c);
  const invitees = body.data.userIds.filter((id) => id !== me);
  if (!invitees.length) return c.json({ error: "Lade mindestens eine Person ein" }, 400);
  const id = await db.transaction(async (tx) => {
    const [cv] = await tx.insert(conversations).values({ name: body.data.name, isGroup: true, createdBy: me, avatarUrl: body.data.avatar ?? null }).returning({ id: conversations.id });
    await tx.insert(conversationMembers).values({ conversationId: cv!.id, userId: me, role: "admin" });
    const [topic] = await tx.insert(conversationTopics).values({ conversationId: cv!.id, name: DEFAULT_TOPIC_NAME, isDefault: true, position: 0, createdBy: me }).returning({ id: conversationTopics.id });
    await tx.insert(messages).values({ conversationId: cv!.id, senderId: me, kind: "system", topicId: topic!.id, text: `${await nameOf(me)} hat die Gruppe erstellt` });
    return cv!.id;
  });
  const access = await requireGroup(id, me);
  let skipped: Skipped[];
  try { skipped = (await createInvites(access, me, invitees)).skipped; } catch (e) { return fullError(c, e); }
  await announceGroupChange(id, [me]);
  return c.json({ ...(await groupDetail(await requireGroup(id, me), me)), skipped }, 201);
});

chatGroups.get("/groups/:id", async (c) => {
  const me = c.get("userId");
  return c.json(await groupDetail(await requireGroup(uuid(c.req.param("id")), me), me));
});

chatGroups.patch("/groups/:id", async (c) => {
  const me = c.get("userId");
  const access = await requireGroup(uuid(c.req.param("id")), me);
  requireAdmin(access);
  const body = z.object({ name: name60.optional(), avatar: imageRef.nullable().optional(), historyVisible: z.boolean().optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return bad(c);
  const set: Partial<typeof conversations.$inferInsert> = {};
  if (body.data.name !== undefined) set.name = body.data.name;
  if (body.data.avatar !== undefined) set.avatarUrl = body.data.avatar;
  if (body.data.historyVisible !== undefined) set.historyVisible = body.data.historyVisible;
  if (!Object.keys(set).length) return bad(c);
  await db.update(conversations).set(set).where(eq(conversations.id, access.cv.id));
  if (set.name !== undefined && set.name !== access.cv.name) await postSystemMessage(access, me, `${await nameOf(me)} hat die Gruppe in „${set.name}“ umbenannt`);
  await announceGroupChange(access.cv.id, access.memberIds);
  return c.json(await groupDetail(await requireGroup(access.cv.id, me), me));
});

/* ------------------------------------------------------------------ Einladungen */

chatGroups.post("/groups/:id/invites", rateLimit({ name: "chat-group-invite", limit: 30, windowMs: 10 * 60_000, keys: userKey }), async (c) => {
  const me = c.get("userId");
  const access = await requireGroup(uuid(c.req.param("id")), me);
  requireAdmin(access);
  const body = z.object({ userIds: userIds(MAX_GROUP_MEMBERS).refine((a) => a.length >= 1) }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return bad(c);
  try { return c.json(await createInvites(access, me, body.data.userIds.filter((id) => id !== me)), 201); } catch (e) { return fullError(c, e); }
});

chatGroups.delete("/groups/:id/invites/:inviteId", async (c) => {
  const me = c.get("userId");
  const access = await requireGroup(uuid(c.req.param("id")), me);
  requireAdmin(access);
  const [inv] = await db.update(conversationInvites).set({ status: "revoked", respondedAt: new Date() })
    .where(and(eq(conversationInvites.id, uuid(c.req.param("inviteId"))), eq(conversationInvites.conversationId, access.cv.id), eq(conversationInvites.status, "pending"))).returning();
  if (!inv) return c.json({ error: "Einladung nicht gefunden" }, 404);
  await announceGroupChange(access.cv.id, access.memberIds, [inv.inviteeId]);
  return c.body(null, 204);
});

/** Meine offenen Einladungen (nicht abgelaufen). */
chatGroups.get("/invites", async (c) => {
  const me = c.get("userId");
  await db.update(conversationInvites).set({ status: "expired" }).where(and(eq(conversationInvites.inviteeId, me), eq(conversationInvites.status, "pending"), sql`${conversationInvites.expiresAt} < now()`));
  const rows = await db.select({ inv: conversationInvites, group: conversations.name, avatar: conversations.avatarUrl, inviter: users.name }).from(conversationInvites)
    .innerJoin(conversations, eq(conversations.id, conversationInvites.conversationId)).leftJoin(users, eq(users.id, conversationInvites.inviterId))
    .where(and(eq(conversationInvites.inviteeId, me), eq(conversationInvites.status, "pending"))).orderBy(asc(conversationInvites.createdAt));
  const counts = rows.length ? await db.select({ id: conversationMembers.conversationId, n: count() }).from(conversationMembers).where(inArray(conversationMembers.conversationId, rows.map((r) => r.inv.conversationId))).groupBy(conversationMembers.conversationId) : [];
  return c.json(rows.map((r) => ({
    id: r.inv.id, conversationId: r.inv.conversationId, groupName: r.group, groupAvatar: r.avatar ?? "", inviterName: r.inviter ?? "Jemand",
    memberCount: counts.find((x) => x.id === r.inv.conversationId)?.n ?? 0, createdAt: r.inv.createdAt.toISOString(), expiresAt: r.inv.expiresAt.toISOString(),
  })));
});

chatGroups.post("/invites/:id/accept", async (c) => {
  const me = c.get("userId");
  const inviteId = uuid(c.req.param("id"));
  const [probe] = await db.select().from(conversationInvites).where(and(eq(conversationInvites.id, inviteId), eq(conversationInvites.inviteeId, me))).limit(1);
  if (!probe) return c.json({ error: "Einladung nicht gefunden" }, 404);
  const outcome = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM conversations WHERE id = ${probe.conversationId} FOR UPDATE`);
    const [inv] = await tx.select().from(conversationInvites).where(eq(conversationInvites.id, inviteId)).limit(1);
    if (!inv || inv.status !== "pending") return "gone" as const;
    if (inv.expiresAt.getTime() < Date.now()) { await tx.update(conversationInvites).set({ status: "expired" }).where(eq(conversationInvites.id, inviteId)); return "expired" as const; }
    const [n] = await tx.select({ n: count() }).from(conversationMembers).where(eq(conversationMembers.conversationId, inv.conversationId));
    if ((n?.n ?? 0) >= MAX_GROUP_MEMBERS) return "full" as const;
    await tx.insert(conversationMembers).values({ conversationId: inv.conversationId, userId: me, role: "member" }).onConflictDoNothing();
    await tx.update(conversationInvites).set({ status: "accepted", respondedAt: new Date() }).where(eq(conversationInvites.id, inviteId));
    return "ok" as const;
  });
  if (outcome === "gone") return c.json({ error: "Einladung nicht mehr gültig" }, 409);
  if (outcome === "expired") return c.json({ error: "Einladung abgelaufen" }, 410);
  if (outcome === "full") return c.json({ error: "Gruppe voll" }, 409);
  const access = await requireGroup(probe.conversationId, me);
  await postSystemMessage(access, me, `${await nameOf(me)} ist der Gruppe beigetreten`);
  await announceGroupChange(access.cv.id, access.memberIds);
  return c.json({ conversationId: access.cv.id });
});

chatGroups.post("/invites/:id/decline", async (c) => {
  const me = c.get("userId");
  const [inv] = await db.update(conversationInvites).set({ status: "declined", respondedAt: new Date() })
    .where(and(eq(conversationInvites.id, uuid(c.req.param("id"))), eq(conversationInvites.inviteeId, me), eq(conversationInvites.status, "pending"))).returning();
  if (!inv) return c.json({ error: "Einladung nicht gefunden" }, 404);
  const members = await db.select({ id: conversationMembers.userId }).from(conversationMembers).where(eq(conversationMembers.conversationId, inv.conversationId));
  await announceGroupChange(inv.conversationId, members.map((m) => m.id), [me]);
  return c.body(null, 204);
});

/* ------------------------------------------------------------------ Mitglieder */

/** Mitgliedschaft samt persönlichem Themen-Stand entfernen. */
async function dropMember(conversationId: string, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const topicIds = (await tx.select({ id: conversationTopics.id }).from(conversationTopics).where(eq(conversationTopics.conversationId, conversationId))).map((t) => t.id);
    if (topicIds.length) {
      await tx.delete(topicMembers).where(and(inArray(topicMembers.topicId, topicIds), eq(topicMembers.userId, userId)));
      await tx.delete(topicUserState).where(and(inArray(topicUserState.topicId, topicIds), eq(topicUserState.userId, userId)));
    }
    await tx.delete(conversationMembers).where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)));
  });
}

chatGroups.delete("/groups/:id/members/:userId", async (c) => {
  const me = c.get("userId");
  const access = await requireGroup(uuid(c.req.param("id")), me);
  requireAdmin(access);
  const target = uuid(c.req.param("userId"));
  if (target === me) return c.json({ error: "Zum Verlassen „Gruppe verlassen“ nutzen" }, 400);
  if (!access.memberIds.includes(target)) return c.json({ error: "Mitglied nicht gefunden" }, 404);
  await dropMember(access.cv.id, target);
  const rest = { ...access, members: access.members.filter((m) => m.userId !== target) };
  await postSystemMessage(rest, me, `${await nameOf(target)} wurde von ${await nameOf(me)} entfernt`);
  await announceGroupChange(access.cv.id, rest.members.map((m) => m.userId), [target]);
  return c.body(null, 204);
});

chatGroups.post("/groups/:id/leave", async (c) => {
  const me = c.get("userId");
  const access = await requireGroup(uuid(c.req.param("id")), me);
  const myName = await nameOf(me);
  await dropMember(access.cv.id, me);
  const rest = { ...access, members: access.members.filter((m) => m.userId !== me) };
  const fix = await repairAfterDeparture(access.cv.id);
  if (!fix.deleted) {
    await postSystemMessage(rest, me, `${myName} hat die Gruppe verlassen`);
    if (fix.promoted) {
      const promoted = rest.members.map((m) => (m.userId === fix.promoted ? { ...m, role: "admin" as const } : m));
      await postSystemMessage({ ...rest, members: promoted }, fix.promoted, `${await nameOf(fix.promoted)} ist jetzt Admin`);
    }
    await announceGroupChange(access.cv.id, rest.members.map((m) => m.userId), [me]);
  } else await publish({ users: [me] }, { type: "chat.group", conversationId: access.cv.id });
  return c.body(null, 204);
});

/* ------------------------------------------------------------------ Themen */

async function loadTopic(c: { req: { param: (k: string) => string } }, me: string, adminOnly = true) {
  const access = await requireGroup(uuid(c.req.param("id")), me);
  if (adminOnly) requireAdmin(access);
  const topic = await requireTopic(access.cv.id, uuid(c.req.param("tid")), access);
  return { access, topic };
}

chatGroups.post("/groups/:id/topics", rateLimit({ name: "chat-topic-create", limit: 30, windowMs: 10 * 60_000, keys: userKey }), async (c) => {
  const me = c.get("userId");
  const access = await requireGroup(uuid(c.req.param("id")), me);
  requireAdmin(access);
  const body = z.object({ name: topicName, emoji: emoji.default(""), private: z.boolean().default(false), adminsOnly: z.boolean().default(false), userIds: userIds(MAX_GROUP_MEMBERS).default([]) })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return bad(c);
  const members = body.data.userIds.filter((id) => access.memberIds.includes(id));
  if (members.length !== body.data.userIds.length) return c.json({ error: "Nur Gruppenmitglieder können in ein privates Thema" }, 400);
  const [n] = await db.select({ n: count(), max: sql<number>`coalesce(max(${conversationTopics.position}), 0)` }).from(conversationTopics).where(eq(conversationTopics.conversationId, access.cv.id));
  if ((n?.n ?? 0) >= MAX_TOPICS) return c.json({ error: `Höchstens ${MAX_TOPICS} Themen je Gruppe` }, 409);
  const [topic] = await db.insert(conversationTopics).values({
    conversationId: access.cv.id, name: body.data.name, emoji: body.data.emoji, isPrivate: body.data.private, adminsOnly: body.data.adminsOnly, position: (n?.max ?? 0) + 1, createdBy: me,
  }).returning();
  if (topic!.isPrivate) {
    const withMe = [...new Set([me, ...members])];
    await db.insert(topicMembers).values(withMe.map((userId) => ({ topicId: topic!.id, userId })));
  }
  // Öffentliche Themen werden im Standardthema angekündigt; private nur im Thema selbst (kein Hinweis an Außenstehende).
  await postSystemMessage(access, me, `${await nameOf(me)} hat das Thema „${label(topic!)}“ erstellt`, topic!.isPrivate ? topic! : undefined);
  await announceGroupChange(access.cv.id, access.memberIds);
  return c.json(await groupDetail(await requireGroup(access.cv.id, me), me), 201);
});

chatGroups.patch("/groups/:id/topics/:tid", async (c) => {
  const me = c.get("userId");
  const { access, topic } = await loadTopic(c, me);
  const body = z.object({ name: topicName.optional(), emoji: emoji.optional(), adminsOnly: z.boolean().optional(), closed: z.boolean().optional(), pinned: z.boolean().optional() }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return bad(c);
  const set = Object.fromEntries(Object.entries(body.data).filter(([, v]) => v !== undefined));
  if (!Object.keys(set).length) return bad(c);
  const [updated] = await db.update(conversationTopics).set(set).where(eq(conversationTopics.id, topic.id)).returning();
  const who = await nameOf(me);
  if ((body.data.name !== undefined && body.data.name !== topic.name) || (body.data.emoji !== undefined && body.data.emoji !== topic.emoji)) await postSystemMessage(access, me, `${who} hat das Thema „${label(topic)}“ in „${label(updated!)}“ umbenannt`, updated!);
  if (body.data.closed !== undefined && body.data.closed !== topic.closed) await postSystemMessage(access, me, `${who} hat das Thema ${body.data.closed ? "geschlossen" : "wieder geöffnet"}`, updated!);
  await announceGroupChange(access.cv.id, access.memberIds);
  return c.json(await groupDetail(await requireGroup(access.cv.id, me), me));
});

chatGroups.delete("/groups/:id/topics/:tid", async (c) => {
  const me = c.get("userId");
  const { access, topic } = await loadTopic(c, me);
  if (topic.isDefault) return c.json({ error: "Das Standardthema „Allgemein“ kann nicht gelöscht werden" }, 400);
  await db.transaction(async (tx) => {
    await tx.delete(messages).where(eq(messages.topicId, topic.id));
    await tx.delete(conversationTopics).where(eq(conversationTopics.id, topic.id));
  });
  await postSystemMessage(access, me, `${await nameOf(me)} hat das Thema „${label(topic)}“ gelöscht`);
  await announceGroupChange(access.cv.id, access.memberIds);
  return c.body(null, 204);
});

/** Reihenfolge: ein Thema um eine Stelle verschieben (innerhalb der angehefteten bzw. der übrigen Themen). */
chatGroups.post("/groups/:id/topics/:tid/move", async (c) => {
  const me = c.get("userId");
  const { access, topic } = await loadTopic(c, me);
  const body = z.object({ direction: z.enum(["up", "down"]) }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return bad(c);
  const all = (await db.select().from(conversationTopics).where(eq(conversationTopics.conversationId, access.cv.id)).orderBy(asc(conversationTopics.position), asc(conversationTopics.createdAt)))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const i = all.findIndex((t) => t.id === topic.id);
  const j = body.data.direction === "up" ? i - 1 : i + 1;
  if (j >= 0 && j < all.length && all[j]!.pinned === all[i]!.pinned) {
    [all[i], all[j]] = [all[j]!, all[i]!];
    await db.transaction(async (tx) => { for (const [pos, t] of all.entries()) await tx.update(conversationTopics).set({ position: pos }).where(eq(conversationTopics.id, t.id)); });
    await announceGroupChange(access.cv.id, access.memberIds);
  }
  return c.json(await groupDetail(await requireGroup(access.cv.id, me), me));
});

/** Mitglieder eines privaten Themas festlegen (Admins sehen es immer). */
chatGroups.put("/groups/:id/topics/:tid/members", async (c) => {
  const me = c.get("userId");
  const { access, topic } = await loadTopic(c, me);
  if (!topic.isPrivate) return c.json({ error: "Nur private Themen haben eine eigene Mitgliederliste" }, 400);
  const body = z.object({ userIds: userIds(MAX_GROUP_MEMBERS) }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return bad(c);
  if (body.data.userIds.some((id) => !access.memberIds.includes(id))) return c.json({ error: "Nur Gruppenmitglieder können in ein privates Thema" }, 400);
  await db.transaction(async (tx) => {
    await tx.delete(topicMembers).where(eq(topicMembers.topicId, topic.id));
    if (body.data.userIds.length) await tx.insert(topicMembers).values(body.data.userIds.map((userId) => ({ topicId: topic.id, userId })));
  });
  await announceGroupChange(access.cv.id, access.memberIds);
  return c.json(await groupDetail(await requireGroup(access.cv.id, me), me));
});

/** Eigene Stummschaltung eines Themas (kein Push, zählt nicht in Badge und Summe). */
chatGroups.put("/groups/:id/topics/:tid/me", async (c) => {
  const me = c.get("userId");
  const { topic } = await loadTopic(c, me, false);
  const body = z.object({ muted: z.boolean() }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return bad(c);
  await db.insert(topicUserState).values({ topicId: topic.id, userId: me, muted: body.data.muted })
    .onConflictDoUpdate({ target: [topicUserState.topicId, topicUserState.userId], set: { muted: body.data.muted } });
  await publish({ users: [me] }, { type: "chat.group", conversationId: topic.conversationId });
  return c.body(null, 204);
});

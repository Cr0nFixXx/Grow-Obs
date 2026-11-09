import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, count, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import {
  comments,
  moderationLog,
  sessions,
  grows,
  hallEntries,
  itemComments,
  notifications,
  postLikes,
  postBookmarks,
  posts,
  products,
  reports,
  strains,
  threadVotes,
  threads,
  users,
  wikiArticles,
} from "../db/schema.ts";
import { requireAuth, requirePlatformAdmin, type AuthEnv } from "../middleware/auth.ts";
import { logModeration } from "../lib/platform-moderation.ts";
import { deleteAccount, deleteOptionsSchema, DELETE_CONFIRM_WORD, handOverCommunities } from "../lib/account.ts";
import { rateLimit, userKey } from "../middleware/rate-limit.ts";
import { verifyPassword } from "../lib/password.ts";
import { systemHealth } from "../lib/health.ts";
import { uuid } from "../lib/validation.ts";

/** Betreiber-Routen: immer Auth + platform_admin. */
export const admin = new Hono<AuthEnv>();
admin.use("*", requireAuth, requirePlatformAdmin);

admin.get("/health", async (c) => {
  return c.json(await systemHealth());
});

admin.get("/stats", async (c) => {
  const [[u], [g], [p], [t], [cm], [s], [pr], [w], [h], [n], [active]] = await Promise.all([
    db.select({ n: count() }).from(users).where(isNull(users.deletedAt)),
    db.select({ n: count() }).from(grows),
    db.select({ n: count() }).from(posts),
    db.select({ n: count() }).from(threads),
    db.select({ n: count() }).from(comments),
    db.select({ n: count() }).from(strains),
    db.select({ n: count() }).from(products),
    db.select({ n: count() }).from(wikiArticles),
    db.select({ n: count() }).from(hallEntries),
    db.select({ n: count() }).from(notifications),
    db.select({ n: count() }).from(grows).where(sql`${grows.status} = 'active' and ${grows.archivedAt} is null`),
  ]);
  return c.json({
    users: u.n, grows: g.n, activeGrows: active.n, posts: p.n, threads: t.n,
    comments: cm.n, strains: s.n, products: pr.n, wikiArticles: w.n,
    hallEntries: h.n, notifications: n.n,
  });
});

admin.get("/users", async (c) => {
  const q = c.req.query("q")?.trim().slice(0, 100);
  const where = q
    ? and(isNull(users.deletedAt), or(ilike(users.name, `%${q}%`), ilike(users.handle, `%${q}%`), ilike(users.email, `%${q}%`)))
    : isNull(users.deletedAt);
  const rows = await db
    .select({
      id: users.id, name: users.name, handle: users.handle, email: users.email,
      role: users.role, level: users.level, createdAt: users.createdAt, emailVerifiedAt: users.emailVerifiedAt,
      bannedAt: users.bannedAt, banReason: users.banReason,
    })
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt)).limit(100);
  return c.json(
    await Promise.all(rows.map(async (u) => {
      const [g] = await db.select({ n: count() }).from(grows).where(eq(grows.userId, u.id));
      return { id: u.id, name: u.name, handle: u.handle, email: u.email, role: u.role, level: u.level, createdAt: u.createdAt, emailVerified: u.emailVerifiedAt !== null, grows: g.n, status: u.bannedAt ? "gesperrt" : "aktiv", banReason: u.banReason };
    }))
  );
});

/** Betreiber bestätigt eine Adresse von Hand (z. B. wenn Mails eines Anbieters nicht ankommen). Idempotent. */
admin.post("/users/:id/verify-email", async (c) => {
  const targetId = uuid(c.req.param("id"));
  const [row] = await db.update(users).set({ emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` }).where(eq(users.id, targetId)).returning({ id: users.id });
  if (!row) return c.json({ error: "Nicht gefunden" }, 404);
  return c.body(null, 204);
});

const roleSchema = z.object({ role: z.enum(["member", "moderator", "admin", "platform_admin"]) });
admin.patch("/users/:id/role", async (c) => {
  const targetId = uuid(c.req.param("id"));
  const body = roleSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültige Rolle" }, 400);
  const row = await db.transaction(async (tx) => {
    // Serialize rare role changes so two admins cannot remove each other's final role.
    await tx.execute(sql`LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE`);
    const [actor] = await tx.select().from(users).where(eq(users.id, c.get("userId")));
    if (actor?.role !== "platform_admin") throw new HTTPException(403, { message: "Keine Berechtigung" });
    const [target] = await tx.select().from(users).where(eq(users.id, targetId));
    if (!target) throw new HTTPException(404, { message: "User nicht gefunden" });
    if (target.role === "platform_admin" && body.data.role !== "platform_admin") {
      const [admins] = await tx.select({ n: count() }).from(users).where(eq(users.role, "platform_admin"));
      if (admins.n <= 1) throw new HTTPException(409, { message: "Die letzte Betreiber-Rolle darf nicht entfernt werden" });
    }
    const [updated] = await tx.update(users).set({ role: body.data.role }).where(eq(users.id, targetId))
      .returning({ id: users.id, role: users.role });
    return updated;
  });
  return c.json(row);
});

admin.get("/content", async (c) => {
  const recentThreads = await db
    .select({ id: threads.id, title: threads.title, createdAt: threads.createdAt })
    .from(threads).orderBy(desc(threads.createdAt)).limit(8);
  const recentPosts = await db
    .select({ id: posts.id, text: posts.text, createdAt: posts.createdAt })
    .from(posts).where(isNull(posts.communityId)).orderBy(desc(posts.createdAt)).limit(8); // Community-Beiträge bleiben bei der Community (Privatsphäre)
  return c.json([
    ...recentThreads.map((x) => ({ ...x, type: "thread" as const })),
    ...recentPosts.map((x) => ({ ...x, type: "post" as const })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
});

admin.delete("/threads/:id", async (c) => {
  const id = uuid(c.req.param("id"));
  await db.transaction(async (tx) => {
    await tx.delete(threadVotes).where(eq(threadVotes.threadId, id));
    await tx.delete(comments).where(eq(comments.threadId, id));
    await tx.delete(threads).where(eq(threads.id, id));
  });
  return c.json({ ok: true });
});

admin.delete("/posts/:id", async (c) => {
  const id = uuid(c.req.param("id"));
  await db.transaction(async (tx) => {
    await tx.delete(postLikes).where(eq(postLikes.postId, id));
    await tx.delete(postBookmarks).where(eq(postBookmarks.postId, id));
    // Kommentare und Meldungen zum Beitrag (Meldungen auch zu dessen Kommentaren) nicht verwaisen lassen.
    const commentIds = tx.select({ id: itemComments.id }).from(itemComments).where(and(eq(itemComments.kind, "post"), eq(itemComments.itemId, id)));
    await tx.delete(reports).where(or(and(eq(reports.kind, "post"), eq(reports.targetId, id)), and(eq(reports.kind, "comment"), inArray(reports.targetId, commentIds))));
    await tx.delete(itemComments).where(and(eq(itemComments.kind, "post"), eq(itemComments.itemId, id)));
    await tx.delete(posts).where(eq(posts.id, id));
  });
  return c.json({ ok: true });
});

/* ----------------------------- Konten verwalten (B-89) ----------------------------- */

/** Ziel einer Kontoaktion: muss existieren, nicht gelöscht sein, nicht man selbst und kein anderer Betreiber. */
async function manageableUser(actorId: string, targetId: string) {
  if (actorId === targetId) throw new HTTPException(400, { message: "Das eigene Konto kannst du hier nicht verwalten" });
  const [target] = await db.select().from(users).where(and(eq(users.id, targetId), isNull(users.deletedAt))).limit(1);
  if (!target) throw new HTTPException(404, { message: "Konto nicht gefunden" });
  if (target.role === "platform_admin") throw new HTTPException(403, { message: "Betreiber-Konten können nicht gesperrt oder gelöscht werden" });
  return target;
}

const banSchema = z.object({ reason: z.string().trim().max(300).optional() });
/** Sperren: Login aus, alle Sitzungen beendet; Inhalte bleiben. Umkehrbar. Der Grund wird dem Mitglied beim Anmelden gezeigt. */
admin.post("/users/:id/ban", async (c) => {
  const actorId = c.get("userId");
  const body = banSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültige Daten" }, 400);
  const target = await manageableUser(actorId, uuid(c.req.param("id")));
  const reason = body.data.reason || null;
  await db.transaction(async (tx) => {
    await tx.update(users).set({ bannedAt: new Date(), banReason: reason, onlineUntil: null }).where(eq(users.id, target.id));
    await tx.delete(sessions).where(eq(sessions.userId, target.id));
  });
  await logModeration({ actorId, action: "ban", targetUserId: target.id, reason });
  return c.json({ ok: true });
});

admin.post("/users/:id/unban", async (c) => {
  const actorId = c.get("userId");
  const [target] = await db.select().from(users).where(and(eq(users.id, uuid(c.req.param("id"))), isNull(users.deletedAt))).limit(1);
  if (!target) throw new HTTPException(404, { message: "Konto nicht gefunden" });
  if (target.bannedAt) {
    await db.update(users).set({ bannedAt: null, banReason: null }).where(eq(users.id, target.id));
    await logModeration({ actorId, action: "unban", targetUserId: target.id });
  }
  return c.json({ ok: true });
});

const deleteUserSchema = z.object({ password: z.string().min(1).max(128), confirm: z.literal(DELETE_CONFIRM_WORD), options: deleteOptionsSchema, reason: z.string().trim().max(300).optional() });
/**
 * Fremdes Konto endgültig löschen – mit denselben Schaltern wie beim Selbstlöschen, bestätigt mit dem Passwort des Betreibers.
 * Community-Alleinadmins werden vorher durch das dienstälteste Mitglied ersetzt, Gruppen repariert die Löschung selbst.
 */
admin.delete("/users/:id", rateLimit({ name: "admin-account-delete", limit: 10, windowMs: 15 * 60 * 1000, keys: userKey }), async (c) => {
  const actorId = c.get("userId");
  const body = deleteUserSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Bitte Passwort, „LÖSCHEN“ und die Auswahl angeben" }, 400);
  const [actor] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, actorId)).limit(1);
  if (!actor || !(await verifyPassword(body.data.password, actor.passwordHash))) return c.json({ error: "Passwort falsch" }, 403);
  const target = await manageableUser(actorId, uuid(c.req.param("id")));
  await handOverCommunities(target.id);
  await logModeration({ actorId, action: "delete_account", targetUserId: target.id, targetName: target.name, reason: body.data.reason, details: { options: body.data.options } });
  const result = await deleteAccount(target.id, body.data.options);
  return c.json({ ok: true, ...result });
});

/** Protokoll der Moderationsaktionen (neueste zuerst), seitenweise. */
admin.get("/moderation-log", async (c) => {
  const offset = Math.max(0, Number.parseInt(c.req.query("offset") ?? "0", 10) || 0);
  const rows = await db.select().from(moderationLog).orderBy(desc(moderationLog.createdAt)).limit(31).offset(offset);
  return c.json({
    hasMore: rows.length > 30,
    items: rows.slice(0, 30).map((r) => ({
      id: r.id, action: r.action, actor: r.actorName, target: r.targetName, targetKind: r.targetKind, reason: r.reason,
      details: r.details, createdAt: r.createdAt.toISOString(),
    })),
  });
});

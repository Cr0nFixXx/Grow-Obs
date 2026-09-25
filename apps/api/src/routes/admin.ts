import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import {
  comments,
  grows,
  hallEntries,
  notifications,
  postLikes,
  postBookmarks,
  posts,
  products,
  strains,
  threadVotes,
  threads,
  users,
  wikiArticles,
} from "../db/schema.ts";
import { requireAuth, requirePlatformAdmin, type AuthEnv } from "../middleware/auth.ts";
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
    db.select({ n: count() }).from(users),
    db.select({ n: count() }).from(grows),
    db.select({ n: count() }).from(posts),
    db.select({ n: count() }).from(threads),
    db.select({ n: count() }).from(comments),
    db.select({ n: count() }).from(strains),
    db.select({ n: count() }).from(products),
    db.select({ n: count() }).from(wikiArticles),
    db.select({ n: count() }).from(hallEntries),
    db.select({ n: count() }).from(notifications),
    db.select({ n: count() }).from(grows).where(sql`${grows.phase} <> 'Ernte'`),
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
    ? or(ilike(users.name, `%${q}%`), ilike(users.handle, `%${q}%`), ilike(users.email, `%${q}%`))
    : undefined;
  const rows = await db
    .select({
      id: users.id, name: users.name, handle: users.handle, email: users.email,
      role: users.role, level: users.level, createdAt: users.createdAt,
    })
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt)).limit(100);
  return c.json(
    await Promise.all(rows.map(async (u) => {
      const [g] = await db.select({ n: count() }).from(grows).where(eq(grows.userId, u.id));
      return { ...u, grows: g.n, status: "aktiv" };
    }))
  );
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
    .from(posts).orderBy(desc(posts.createdAt)).limit(8);
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
    await tx.delete(posts).where(eq(posts.id, id));
  });
  return c.json({ ok: true });
});
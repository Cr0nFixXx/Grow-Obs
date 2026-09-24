import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { Hono } from "hono";
import { count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import {
  comments,
  grows,
  hallEntries,
  notifications,
  posts,
  products,
  strains,
  threads,
  users,
  wikiArticles,
} from "../db/schema";
import { env } from "../env";
import { requireAuth, requirePlatformAdmin, type AuthEnv } from "../middleware/auth";

/** Betreiber-Routen: immer Auth + platform_admin. */
export const admin = new Hono<AuthEnv>();
admin.use("*", requireAuth, requirePlatformAdmin);

admin.get("/health", async (c) => {
  const started = Date.now();
  let dbOk = false;
  let storageOk = false;
  let dbLatency: number | null = null;
  let dbHint = "Postgres nicht erreichbar";

  try {
    const t0 = Date.now();
    await db.execute(sql`select 1`);
    dbLatency = Date.now() - t0;
    dbOk = true;
    dbHint = "Postgres erreichbar";
  } catch (e) {
    dbHint = e instanceof Error ? e.message : dbHint;
  }

  const s3 = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    forcePathStyle: true,
  });
  try {
    await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
    storageOk = true;
  } catch {
    storageOk = false;
  }

  return c.json({
    ok: dbOk && storageOk,
    mode: env.NODE_ENV,
    latencyMs: Date.now() - started,
    version: "0.1.0",
    services: {
      api: { ok: true, hint: "Hono läuft" },
      db: { ok: dbOk, hint: dbHint, latencyMs: dbLatency },
      storage: { ok: storageOk, hint: storageOk ? `Bucket ${env.S3_BUCKET}` : "MinIO/Bucket nicht erreichbar" },
      ai: { ok: false, hint: "Kein KI-Provider angebunden" },
    },
  });
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
  const q = c.req.query("q")?.trim();
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
    .orderBy(desc(users.createdAt));
  return c.json(
    await Promise.all(rows.map(async (u) => {
      const [g] = await db.select({ n: count() }).from(grows).where(eq(grows.userId, u.id));
      return { ...u, grows: g.n, status: "aktiv" };
    }))
  );
});

const roleSchema = z.object({ role: z.enum(["member", "moderator", "admin", "platform_admin"]) });
admin.patch("/users/:id/role", async (c) => {
  const body = roleSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültige Rolle" }, 400);
  const [row] = await db
    .update(users)
    .set({ role: body.data.role })
    .where(eq(users.id, c.req.param("id")))
    .returning({ id: users.id, role: users.role });
  if (!row) return c.json({ error: "Nicht gefunden" }, 404);
  return c.json(row);
});

admin.get("/content", async (c) => {
  const recentThreads = await db
    .select({ id: threads.id, title: threads.title, createdAt: threads.createdAt })
    .from(threads).orderBy(desc(threads.createdAt)).limit(8);
  const recentPosts = await db
    .select({ id: posts.id, text: posts.text, createdAt: posts.createdAt })
    .from(posts).orderBy(desc(posts.createdAt)).limit(8);
  return c.json({
    recentThreads: recentThreads.map((x) => ({ ...x, type: "thread" as const })),
    recentPosts: recentPosts.map((x) => ({ ...x, type: "post" as const })),
  });
});

admin.delete("/threads/:id", async (c) => {
  await db.delete(comments).where(eq(comments.threadId, c.req.param("id")));
  await db.delete(threads).where(eq(threads.id, c.req.param("id")));
  return c.json({ ok: true });
});

admin.delete("/posts/:id", async (c) => {
  await db.delete(posts).where(eq(posts.id, c.req.param("id")));
  return c.json({ ok: true });
});
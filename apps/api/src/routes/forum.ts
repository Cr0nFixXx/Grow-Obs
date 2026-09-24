import { Hono } from "hono";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { comments, subs, threadVotes, threads } from "../db/schema";
import { requireAuth, type AuthEnv } from "../middleware/auth";
import { ago } from "../lib/time";

export const forum = new Hono<AuthEnv>();

async function commentToNode(id: string): Promise<Record<string, unknown> | null> {
  const c = await db.query.comments.findFirst({
    where: eq(comments.id, id),
    with: { user: true, replies: true },
  });
  if (!c) return null;
  return {
    id: c.id,
    author: c.user.name,
    avatar: c.user.avatarUrl ?? "",
    body: c.body,
    votes: 0,
    ago: ago(c.createdAt),
    replies: await Promise.all(c.replies.map((r) => commentToNode(r.id))),
  };
}

async function brief(id: string) {
  const t = await db.query.threads.findFirst({
    where: eq(threads.id, id),
    with: { sub: true, user: true, votes: true, comments: true },
  });
  if (!t) return null;
  return {
    id: t.id,
    title: t.title,
    sub: t.sub.name,
    author: t.user.name,
    avatar: t.user.avatarUrl ?? "",
    votes: t.votes.reduce((s, v) => s + v.delta, 0),
    comments: t.comments.length,
    ago: ago(t.createdAt),
    excerpt: t.body.slice(0, 140),
    tag: t.tag,
    top: t.isTop,
  };
}

forum.get("/subs", async (c) => {
  const rows = await db.select({ name: subs.name }).from(subs).orderBy(asc(subs.name));
  return c.json(rows.map((r) => r.name));
});

forum.get("/threads", async (c) => {
  const rows = await db.query.threads.findMany({
    with: { sub: true, user: true, votes: true, comments: true },
    orderBy: [desc(threads.createdAt)],
  });
  return c.json(
    rows.map((t) => ({
      id: t.id,
      title: t.title,
      sub: t.sub.name,
      author: t.user.name,
      avatar: t.user.avatarUrl ?? "",
      votes: t.votes.reduce((s, v) => s + v.delta, 0),
      comments: t.comments.length,
      ago: ago(t.createdAt),
      excerpt: t.body.slice(0, 140),
      tag: t.tag,
      top: t.isTop,
    }))
  );
});

forum.get("/threads/:id", async (c) => {
  const b = await brief(c.req.param("id"));
  if (!b) return c.json({ error: "Nicht gefunden" }, 404);
  const roots = await db
    .select({ id: comments.id })
    .from(comments)
    .where(eq(comments.threadId, c.req.param("id")))
    .orderBy(asc(comments.createdAt));
  const commentsList = await Promise.all(roots.map((r) => commentToNode(r.id)));
  return c.json({ ...b, commentsList });
});

const voteSchema = z.object({ delta: z.union([z.literal(1), z.literal(-1)]) });
forum.post("/threads/:id/vote", requireAuth, async (c) => {
  const body = voteSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültige Daten" }, 400);
  await db
    .insert(threadVotes)
    .values({ threadId: c.req.param("id"), userId: c.get("userId"), delta: body.data.delta })
    .onConflictDoUpdate({ target: [threadVotes.threadId, threadVotes.userId], set: { delta: body.data.delta } });
  return c.json({ ok: true });
});

const createThreadSchema = z.object({
  title: z.string().min(1),
  sub: z.string().min(1),
  text: z.string().default(""),
});
forum.post("/threads", requireAuth, async (c) => {
  const body = createThreadSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  const sub = await db.query.subs.findFirst({ where: eq(subs.name, body.data.sub) });
  if (!sub) return c.json({ error: "Bereich nicht gefunden" }, 404);
  const [t] = await db
    .insert(threads)
    .values({ subId: sub.id, userId: c.get("userId"), title: body.data.title, body: body.data.text })
    .returning();
  return c.json(await brief(t.id), 201);
});

const addCommentSchema = z.object({ text: z.string().min(1), parentId: z.string().optional() });
forum.post("/threads/:id/comments", requireAuth, async (c) => {
  const body = addCommentSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  const [cm] = await db
    .insert(comments)
    .values({
      threadId: c.req.param("id"),
      userId: c.get("userId"),
      parentId: body.data.parentId ?? null,
      body: body.data.text,
    })
    .returning();
  return c.json(await commentToNode(cm.id), 201);
});

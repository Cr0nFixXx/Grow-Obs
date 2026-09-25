import { Hono } from "hono";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import { comments, subs, threadVotes, threads, commentVotes } from "../db/schema.ts";
import { optionalAuth, requireAuth, type AuthEnv } from "../middleware/auth.ts";
import { ago } from "../lib/time.ts";
import { uuid } from "../lib/validation.ts";

export const forum = new Hono<AuthEnv>();

type VoteRow = { userId: string; delta: number };
const tally = (votes: VoteRow[], viewerId?: string) => ({
  votes: votes.reduce((s, v) => s + v.delta, 0),
  myVote: viewerId ? (votes.find((v) => v.userId === viewerId)?.delta ?? 0) : 0,
});

async function commentToNode(id: string, viewerId?: string, depth = 0): Promise<Record<string, unknown> | null> {
  const c = await db.query.comments.findFirst({
    where: eq(comments.id, id),
    with: { user: true, replies: true, votes: true },
  });
  if (!c) return null;
  return {
    id: c.id,
    author: c.user.name,
    avatar: c.user.avatarUrl ?? "",
    body: c.body,
    ...tally(c.votes, viewerId),
    ago: ago(c.createdAt),
    // Tiefe begrenzen (UI zeigt max. 4 Ebenen; schützt vor sehr tiefen Ketten).
    replies: depth >= 6 ? [] : await Promise.all(
      [...c.replies].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map((r) => commentToNode(r.id, viewerId, depth + 1)),
    ),
  };
}

async function brief(id: string, viewerId?: string) {
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
    ...tally(t.votes, viewerId),
    comments: t.comments.length,
    ago: ago(t.createdAt),
    excerpt: t.body.slice(0, 140),
    body: t.body,
    tag: t.tag,
    top: t.isTop,
  };
}

forum.get("/subs", async (c) => {
  const rows = await db.select({ name: subs.name }).from(subs).orderBy(asc(subs.name));
  return c.json(rows.map((r) => r.name));
});

forum.get("/threads", optionalAuth, async (c) => {
  const viewerId = c.get("userId") as string | undefined;
  const rows = await db.query.threads.findMany({
    with: { sub: true, user: true, votes: true, comments: true },
    orderBy: [desc(threads.createdAt)],
    limit: 100,
  });
  return c.json(
    rows.map((t) => ({
      id: t.id,
      title: t.title,
      sub: t.sub.name,
      author: t.user.name,
      avatar: t.user.avatarUrl ?? "",
      ...tally(t.votes, viewerId),
      comments: t.comments.length,
      ago: ago(t.createdAt),
      excerpt: t.body.slice(0, 140),
      tag: t.tag,
      top: t.isTop,
    }))
  );
});

forum.get("/threads/:id", optionalAuth, async (c) => {
  uuid(c.req.param("id"));
  const viewerId = c.get("userId") as string | undefined;
  const b = await brief(c.req.param("id"), viewerId);
  if (!b) return c.json({ error: "Nicht gefunden" }, 404);
  const roots = await db
    .select({ id: comments.id })
    .from(comments)
    .where(and(eq(comments.threadId, c.req.param("id")), isNull(comments.parentId)))
    .orderBy(asc(comments.createdAt));
  const commentsList = await Promise.all(roots.map((r) => commentToNode(r.id, viewerId)));
  return c.json({ ...b, commentsList });
});

/** 1 = Upvote, -1 = Downvote, 0 = Vote zurücknehmen. Antwort: neuer Stand. */
const voteSchema = z.object({ delta: z.union([z.literal(1), z.literal(-1), z.literal(0)]) });
forum.post("/threads/:id/vote", requireAuth, async (c) => {
  const threadId = uuid(c.req.param("id"));
  const userId = c.get("userId");
  if (!await brief(threadId)) return c.json({ error: "Thread nicht gefunden" }, 404);
  const body = voteSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültige Daten" }, 400);
  if (body.data.delta === 0) {
    await db.delete(threadVotes).where(and(eq(threadVotes.threadId, threadId), eq(threadVotes.userId, userId)));
  } else {
    await db.insert(threadVotes).values({ threadId, userId, delta: body.data.delta })
      .onConflictDoUpdate({ target: [threadVotes.threadId, threadVotes.userId], set: { delta: body.data.delta } });
  }
  const votes = await db.select({ userId: threadVotes.userId, delta: threadVotes.delta }).from(threadVotes).where(eq(threadVotes.threadId, threadId));
  return c.json(tally(votes, userId));
});

forum.post("/comments/:id/vote", requireAuth, async (c) => {
  const commentId = uuid(c.req.param("id"));
  const userId = c.get("userId");
  if (!await db.query.comments.findFirst({ where: eq(comments.id, commentId) })) return c.json({ error: "Kommentar nicht gefunden" }, 404);
  const body = voteSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültige Daten" }, 400);
  if (body.data.delta === 0) {
    await db.delete(commentVotes).where(and(eq(commentVotes.commentId, commentId), eq(commentVotes.userId, userId)));
  } else {
    await db.insert(commentVotes).values({ commentId, userId, delta: body.data.delta })
      .onConflictDoUpdate({ target: [commentVotes.commentId, commentVotes.userId], set: { delta: body.data.delta } });
  }
  const votes = await db.select({ userId: commentVotes.userId, delta: commentVotes.delta }).from(commentVotes).where(eq(commentVotes.commentId, commentId));
  return c.json(tally(votes, userId));
});

const createThreadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  sub: z.string().min(1).max(100),
  text: z.string().max(20000).default(""),
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

const addCommentSchema = z.object({ text: z.string().trim().min(1).max(10000), parentId: z.string().uuid().optional() });
forum.post("/threads/:id/comments", requireAuth, async (c) => {
  const threadId = uuid(c.req.param("id"));
  const body = addCommentSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  if (!await brief(threadId)) return c.json({ error: "Thread nicht gefunden" }, 404);
  if (body.data.parentId) {
    const parent = await db.query.comments.findFirst({ where: and(eq(comments.id, body.data.parentId), eq(comments.threadId, threadId)) });
    if (!parent) return c.json({ error: "Antwortziel nicht gefunden" }, 404);
  }
  const [cm] = await db
    .insert(comments)
    .values({
      threadId: c.req.param("id"),
      userId: c.get("userId"),
      parentId: body.data.parentId ?? null,
      body: body.data.text,
    })
    .returning();
  return c.json(await commentToNode(cm.id, c.get("userId")), 201);
});

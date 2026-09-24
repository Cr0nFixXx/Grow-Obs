import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { postLikes, posts } from "../db/schema.js";
import { requireAuth, type AuthEnv } from "../middleware/auth.js";
import { ago } from "../lib/time.js";
import { uuid } from "../lib/validation.js";

export const social = new Hono<AuthEnv>();

async function toPost(id: string, viewerId?: string) {
  const p = await db.query.posts.findFirst({
    where: eq(posts.id, id),
    with: { user: true, likes: true, bookmarks: true },
  });
  if (!p) return null;
  return {
    id: p.id,
    author: p.user.name,
    handle: p.user.handle,
    avatar: p.user.avatarUrl ?? "",
    time: ago(p.createdAt),
    text: p.text,
    image: p.imageUrl ?? null,
    likes: p.likes.length,
    comments: 0,
    shares: 0,
    liked: viewerId ? p.likes.some((l) => l.userId === viewerId) : false,
    tags: p.tags,
  };
}

social.get("/posts", requireAuth, async (c) => {
  const userId = c.get("userId");
  const rows = await db.query.posts.findMany({
    with: { user: true, likes: true, bookmarks: true },
    orderBy: [desc(posts.createdAt)],
    limit: 50,
  });
  return c.json(
    rows.map((p) => ({
      id: p.id,
      author: p.user.name,
      handle: p.user.handle,
      avatar: p.user.avatarUrl ?? "",
      time: ago(p.createdAt),
      text: p.text,
      image: p.imageUrl ?? null,
      likes: p.likes.length,
      comments: 0,
      shares: 0,
      liked: p.likes.some((l) => l.userId === userId),
      tags: p.tags,
    }))
  );
});

const createPostSchema = z.object({
  text: z.string().trim().min(1).max(10000),
  image: z.string().url().refine((url) => url.startsWith("https://"), "HTTPS erforderlich").optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
});
social.post("/posts", requireAuth, async (c) => {
  const body = createPostSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  const [p] = await db
    .insert(posts)
    .values({
      userId: c.get("userId"),
      text: body.data.text,
      imageUrl: body.data.image ?? null,
      tags: body.data.tags,
    })
    .returning();
  return c.json(await toPost(p.id, c.get("userId")), 201);
});

social.post("/posts/:id/like", requireAuth, async (c) => {
  const userId = c.get("userId");
  const postId = uuid(c.req.param("id"));
  await db.transaction(async (tx) => {
    const [post] = await tx.select({ id: posts.id }).from(posts).where(eq(posts.id, postId)).for("update");
    if (!post) throw new HTTPException(404, { message: "Beitrag nicht gefunden" });
    const where = and(eq(postLikes.postId, postId), eq(postLikes.userId, userId));
    const [existing] = await tx.select().from(postLikes).where(where);
    if (existing) await tx.delete(postLikes).where(where);
    else await tx.insert(postLikes).values({ postId, userId });
  });
  const p = await toPost(postId, userId);
  if (!p) return c.json({ error: "Nicht gefunden" }, 404);
  return c.json(p);
});

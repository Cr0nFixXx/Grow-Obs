import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import { postLikes, posts } from "../db/schema.ts";
import { requireAuth, type AuthEnv } from "../middleware/auth.ts";
import { ago } from "../lib/time.ts";
import { uuid } from "../lib/validation.ts";
import { imageRef } from "../lib/media-ref.ts";
import { addItemComment, countItemComments, itemCommentSchema, listItemComments } from "../lib/item-comments.ts";
import { communityRole, isModerator, loadPostForViewer } from "../lib/moderation.ts";

export const social = new Hono<AuthEnv>();

type PostRow = typeof posts.$inferSelect & {
  user: { name: string; handle: string; avatarUrl: string | null };
  likes: { userId: string }[];
};

function serialize(p: PostRow, viewerId: string, comments: number) {
  return {
    id: p.id,
    author: p.user.name,
    handle: p.user.handle,
    avatar: p.user.avatarUrl ?? "",
    time: ago(p.createdAt),
    text: p.text,
    image: p.imageUrl ?? null,
    likes: p.likes.length,
    comments,
    shares: 0,
    liked: p.likes.some((l) => l.userId === viewerId),
    tags: p.tags,
    mine: p.userId === viewerId,
    ...(p.communityId ? { communityId: p.communityId } : {}),
    ...(p.hiddenAt ? { hidden: true } : {}),
  };
}

async function toPost(id: string, viewerId: string) {
  const p = await db.query.posts.findFirst({ where: eq(posts.id, id), with: { user: true, likes: true, bookmarks: true } });
  if (!p) return null;
  return serialize(p, viewerId, (await countItemComments("post", [p.id])).get(p.id) ?? 0);
}

/**
 * Feed. Ohne `communityId`: nur Beiträge ohne Community (globaler Feed). Mit `communityId` (B-61): Feed dieser Community – nur für
 * Mitglieder (sonst 404); ausgeblendete Beiträge sieht nur die Moderation (mit `hidden: true`).
 */
social.get("/posts", requireAuth, async (c) => {
  const userId = c.get("userId");
  const communityParam = c.req.query("communityId");
  let where;
  if (communityParam) {
    const communityId = uuid(communityParam);
    const role = await communityRole(communityId, userId);
    if (!role) throw new HTTPException(404, { message: "Community nicht gefunden" });
    where = isModerator(role) ? eq(posts.communityId, communityId) : and(eq(posts.communityId, communityId), isNull(posts.hiddenAt));
  } else {
    where = isNull(posts.communityId);
  }
  const rows = await db.query.posts.findMany({
    where,
    with: { user: true, likes: true, bookmarks: true },
    orderBy: [desc(posts.createdAt)],
    limit: 50,
  });
  const counts = await countItemComments("post", rows.map((p) => p.id));
  return c.json(rows.map((p) => serialize(p, userId, counts.get(p.id) ?? 0)));
});

const createPostSchema = z.object({
  text: z.string().trim().min(1).max(10000),
  image: imageRef.optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  communityId: z.string().uuid().optional(),
});
social.post("/posts", requireAuth, async (c) => {
  const body = createPostSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  if (body.data.communityId && !await communityRole(body.data.communityId, c.get("userId"))) {
    throw new HTTPException(403, { message: "Nur Mitglieder dürfen in dieser Community schreiben" });
  }
  const [p] = await db
    .insert(posts)
    .values({
      userId: c.get("userId"),
      text: body.data.text,
      imageUrl: body.data.image ?? null,
      tags: body.data.tags,
      communityId: body.data.communityId ?? null,
    })
    .returning();
  return c.json(await toPost(p.id, c.get("userId")), 201);
});

social.get("/posts/:id/comments", requireAuth, async (c) => {
  const id = uuid(c.req.param("id"));
  const { moderator } = await loadPostForViewer(id, c.get("userId"));
  return c.json(await listItemComments("post", id, { viewerId: c.get("userId"), includeHidden: moderator }));
});

social.post("/posts/:id/comments", requireAuth, async (c) => {
  const id = uuid(c.req.param("id"));
  const body = itemCommentSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  await loadPostForViewer(id, c.get("userId"));
  return c.json(await addItemComment("post", id, c.get("userId"), body.data.text), 201);
});

social.post("/posts/:id/like", requireAuth, async (c) => {
  const userId = c.get("userId");
  const postId = uuid(c.req.param("id"));
  await loadPostForViewer(postId, userId);
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

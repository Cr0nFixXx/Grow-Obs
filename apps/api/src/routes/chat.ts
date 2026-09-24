import { Hono } from "hono";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { conversationMembers, conversations, messages } from "../db/schema";
import { requireAuth, type AuthEnv } from "../middleware/auth";
import { ago } from "../lib/time";

export const chat = new Hono<AuthEnv>();

chat.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const memberships = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId));
  const ids = memberships.map((m) => m.conversationId);
  const convs = await db.select().from(conversations);
  return c.json(
    await Promise.all(
      convs
        .filter((cv) => ids.includes(cv.id))
        .map(async (cv) => {
          const msgs = await db
            .select()
            .from(messages)
            .where(eq(messages.conversationId, cv.id))
            .orderBy(asc(messages.createdAt));
          const last = msgs.length ? msgs[msgs.length - 1] : null;
          return {
            id: cv.id,
            name: cv.name,
            avatar: cv.avatarUrl ?? "",
            online: false,
            last: last ? last.text : "",
            time: last ? ago(last.createdAt) : "",
            unread: msgs.filter((m) => m.senderId !== userId).length,
          };
        })
    )
  );
});

chat.get("/:id/messages", requireAuth, async (c) => {
  const userId = c.get("userId");
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, c.req.param("id")))
    .orderBy(asc(messages.createdAt));
  return c.json(
    msgs.map((m) => ({ id: m.id, from: m.senderId === userId ? "me" : "them", text: m.text, time: ago(m.createdAt) }))
  );
});

chat.post("/:id/messages", requireAuth, async (c) => {
  const body = z.object({ text: z.string().min(1) }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültige Daten" }, 400);
  const [m] = await db
    .insert(messages)
    .values({ conversationId: c.req.param("id"), senderId: c.get("userId"), text: body.data.text })
    .returning();
  return c.json({ id: m.id, from: "me", text: m.text, time: "jetzt" }, 201);
});

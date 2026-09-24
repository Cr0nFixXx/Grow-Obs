import { Hono } from "hono";
import { and, count, desc, eq, ne } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../db/client.js";
import { conversationMembers, conversations, messages } from "../db/schema.js";
import { requireAuth, type AuthEnv } from "../middleware/auth.js";
import { ago } from "../lib/time.js";
import { pageLimit, uuid } from "../lib/validation.js";

export const chat = new Hono<AuthEnv>();
chat.use("*", requireAuth);

async function requireMembership(id: string, userId: string) {
  const [member] = await db.select().from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, userId))).limit(1);
  if (!member) throw new HTTPException(404, { message: "Konversation nicht gefunden" });
}

chat.get("/", async (c) => {
  const userId = c.get("userId");
  const convs = await db.select({ conversation: conversations }).from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(eq(conversationMembers.userId, userId)).orderBy(desc(conversations.createdAt))
    .limit(pageLimit(c.req.query("limit")));
  return c.json(
    await Promise.all(
      convs.map(async ({ conversation: cv }) => {
          const [last] = await db
            .select()
            .from(messages)
            .where(eq(messages.conversationId, cv.id))
            .orderBy(desc(messages.createdAt)).limit(1);
          const [received] = await db.select({ n: count() }).from(messages)
            .where(and(eq(messages.conversationId, cv.id), ne(messages.senderId, userId)));
          return {
            id: cv.id,
            name: cv.name,
            avatar: cv.avatarUrl ?? "",
            online: false,
            last: last ? last.text : "",
            time: last ? ago(last.createdAt) : "",
            // Read positions are not implemented; do not label all history as unread.
            unread: 0,
            receivedMessages: received.n,
          };
        })
    )
  );
});

chat.get("/:id/messages", async (c) => {
  const userId = c.get("userId");
  const id = uuid(c.req.param("id"));
  await requireMembership(id, userId);
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(desc(messages.createdAt)).limit(pageLimit(c.req.query("limit")));
  return c.json(
    msgs.reverse().map((m) => ({ id: m.id, from: m.senderId === userId ? "me" : "them", text: m.text, time: ago(m.createdAt) }))
  );
});

chat.post("/:id/messages", async (c) => {
  const id = uuid(c.req.param("id"));
  await requireMembership(id, c.get("userId"));
  const body = z.object({ text: z.string().trim().min(1).max(10000) }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültige Daten" }, 400);
  const [m] = await db
    .insert(messages)
    .values({ conversationId: id, senderId: c.get("userId"), text: body.data.text })
    .returning();
  return c.json({ id: m.id, from: "me", text: m.text, time: "jetzt" }, 201);
});

import { Hono } from "hono";
import { and, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { imageRef } from "../lib/media-ref.ts";
import { db } from "../db/client.ts";
import { conversationMembers, conversations, messages, users } from "../db/schema.ts";
import { requireAuth, type AuthEnv } from "../middleware/auth.ts";
import { rateLimit, userKey } from "../middleware/rate-limit.ts";
import { ago } from "../lib/time.ts";
import { pageLimit, uuid } from "../lib/validation.ts";
import { onlineAmong, publish } from "../realtime/hub.ts";
import { announceTyping } from "../realtime/commands.ts";

export const chat = new Hono<AuthEnv>();
chat.use("*", requireAuth);

/** Mitglieder-IDs der Konversation; 404, wenn der Nutzer kein Mitglied ist. */
async function requireMembers(id: string, userId: string): Promise<string[]> {
  const rows = await db.select({ userId: conversationMembers.userId }).from(conversationMembers).where(eq(conversationMembers.conversationId, id));
  if (!rows.some((r) => r.userId === userId)) throw new HTTPException(404, { message: "Konversation nicht gefunden" });
  return rows.map((r) => r.userId);
}

export interface ConversationDto {
  id: string; name: string; avatar: string; online: boolean; last: string; time: string; unread: number;
  isGroup: boolean; partnerId: string | null;
}

/** Konversationen des Nutzers (neueste Aktivität zuerst) mit Gegenstelle, Online-Status und ungelesenen Nachrichten. */
async function conversationList(userId: string, opts: { ids?: string[]; limit?: number; includeEmpty?: boolean } = {}): Promise<ConversationDto[]> {
  const mine = await db.select({ cv: conversations, lastReadAt: conversationMembers.lastReadAt })
    .from(conversationMembers).innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(and(eq(conversationMembers.userId, userId), opts.ids ? inArray(conversations.id, opts.ids) : undefined));
  if (!mine.length) return [];
  const ids = mine.map((m) => m.cv.id);

  const members = await db.select({ conversationId: conversationMembers.conversationId, id: users.id, name: users.name, avatar: users.avatarUrl })
    .from(conversationMembers).innerJoin(users, eq(users.id, conversationMembers.userId)).where(inArray(conversationMembers.conversationId, ids));
  const lastRows = await db.execute<{ conversation_id: string; text: string; image_url: string | null; created_at: Date }>(sql`
    SELECT DISTINCT ON (conversation_id) conversation_id, text, image_url, created_at FROM messages
    WHERE conversation_id IN ${ids} ORDER BY conversation_id, created_at DESC`);
  const unreadRows = await db.execute<{ conversation_id: string; n: number }>(sql`
    SELECT m.conversation_id, count(*)::int AS n FROM messages m
    JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ${userId}
    WHERE m.conversation_id IN ${ids} AND m.sender_id <> ${userId} AND m.created_at > cm.last_read_at GROUP BY m.conversation_id`);
  const last = new Map(lastRows.map((r) => [r.conversation_id, r]));
  const unread = new Map(unreadRows.map((r) => [r.conversation_id, r.n]));
  const partners = new Map<string, { id: string; name: string; avatar: string | null }>();
  for (const cv of mine.map((m) => m.cv).filter((c) => !c.isGroup)) {
    const others = members.filter((m) => m.conversationId === cv.id && m.id !== userId);
    if (others.length === 1) partners.set(cv.id, others[0]!);
  }
  const online = await onlineAmong([...new Set([...partners.values()].map((p) => p.id))]);

  const rows = mine
    .filter(({ cv }) => opts.includeEmpty || cv.isGroup || last.has(cv.id) || cv.createdBy === userId || cv.createdBy === null)
    .map(({ cv }) => {
      const partner = partners.get(cv.id);
      const lastMessage = last.get(cv.id);
      const at = new Date(lastMessage?.created_at ?? cv.createdAt).getTime();
      const dto: ConversationDto = {
        id: cv.id,
        name: partner?.name ?? cv.name,
        avatar: partner ? (partner.avatar ?? "") : (cv.avatarUrl ?? ""),
        online: partner ? online.has(partner.id) : false,
        last: lastMessage ? (lastMessage.text || (lastMessage.image_url ? "📷 Bild" : "")) : "",
        time: lastMessage ? ago(lastMessage.created_at) : "",
        unread: unread.get(cv.id) ?? 0,
        isGroup: cv.isGroup,
        partnerId: partner?.id ?? null,
      };
      return { dto, at };
    })
    .sort((a, b) => b.at - a.at);
  return rows.slice(0, opts.limit ?? 200).map((r) => r.dto);
}

chat.get("/", async (c) => c.json(await conversationList(c.get("userId"), { limit: pageLimit(c.req.query("limit")) })));

/** Gesamtzahl ungelesener Nachrichten (Badge in der Navigation). */
chat.get("/unread", async (c) => {
  const userId = c.get("userId");
  const [row] = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM messages m JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ${userId}
    WHERE m.sender_id <> ${userId} AND m.created_at > cm.last_read_at`);
  return c.json({ total: row?.n ?? 0 });
});

/** Personensuche für „Neue Nachricht“ (mind. 2 Zeichen, höchstens 10 Treffer, ohne sich selbst). */
chat.get("/users", rateLimit({ name: "chat-users", limit: 60, windowMs: 60_000, keys: userKey }), async (c) => {
  const q = (c.req.query("q") ?? "").trim().slice(0, 50);
  if (q.length < 2) return c.json([]);
  const pattern = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
  const rows = await db.select({ id: users.id, name: users.name, handle: users.handle, avatar: users.avatarUrl }).from(users)
    .where(and(ne(users.id, c.get("userId")), or(ilike(users.name, pattern), ilike(users.handle, pattern)))).orderBy(users.name).limit(10);
  return c.json(rows.map((r) => ({ id: r.id, name: r.name, handle: r.handle, avatar: r.avatar ?? "" })));
});

/** Direktnachricht mit einer Person starten bzw. die bestehende öffnen (idempotent, ein Chat je Paar). */
chat.post("/", rateLimit({ name: "chat-start", limit: 30, windowMs: 10 * 60_000, keys: userKey }), async (c) => {
  const me = c.get("userId");
  const body = z.object({ userId: z.string().uuid() }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültige Daten" }, 400);
  if (body.data.userId === me) return c.json({ error: "Du kannst dir nicht selbst schreiben" }, 400);
  const [partner] = await db.select({ id: users.id }).from(users).where(eq(users.id, body.data.userId)).limit(1);
  if (!partner) return c.json({ error: "Person nicht gefunden" }, 404);
  const directKey = [me, partner.id].sort().join(":");
  const created = await db.transaction(async (tx) => {
    const [row] = await tx.insert(conversations).values({ name: "", isGroup: false, createdBy: me, directKey }).onConflictDoNothing().returning({ id: conversations.id });
    if (!row) return null;
    await tx.insert(conversationMembers).values([{ conversationId: row.id, userId: me }, { conversationId: row.id, userId: partner.id }]);
    return row.id;
  });
  const [existing] = created ? [{ id: created }] : await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.directKey, directKey)).limit(1);
  const [item] = await conversationList(me, { ids: [existing!.id], includeEmpty: true });
  return c.json(item, created ? 201 : 200);
});

chat.get("/:id/messages", async (c) => {
  const userId = c.get("userId");
  const id = uuid(c.req.param("id"));
  await requireMembers(id, userId);
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(desc(messages.createdAt)).limit(pageLimit(c.req.query("limit")));
  return c.json(
    msgs.reverse().map((m) => ({ id: m.id, from: m.senderId === userId ? "me" : "them", text: m.text, image: m.imageUrl ?? undefined, time: ago(m.createdAt), createdAt: m.createdAt.toISOString() }))
  );
});

chat.post("/:id/messages", rateLimit({ name: "chat-send", limit: 90, windowMs: 60_000, keys: userKey }), async (c) => {
  const id = uuid(c.req.param("id"));
  const userId = c.get("userId");
  const members = await requireMembers(id, userId);
  const body = z.object({ text: z.string().trim().max(10000).default(""), image: imageRef.optional() })
    .refine((v) => v.text.length > 0 || !!v.image, "Text oder Bild erforderlich")
    .safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültige Daten" }, 400);
  const [m] = await db
    .insert(messages)
    .values({ conversationId: id, senderId: userId, text: body.data.text, imageUrl: body.data.image ?? null })
    .returning();
  // Wer schreibt, hat den Chat gelesen (eigene Nachricht erhöht nie den eigenen Zähler).
  await db.update(conversationMembers).set({ lastReadAt: m!.createdAt }).where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, userId)));
  await publish({ users: members }, { type: "chat.message", conversationId: id, messageId: m!.id, senderId: userId });
  return c.json({ id: m!.id, from: "me", text: m!.text, image: m!.imageUrl ?? undefined, time: "jetzt", createdAt: m!.createdAt.toISOString() }, 201);
});

/** Leseposition setzen: alles bis jetzt gilt als gelesen. Andere Geräte des Nutzers aktualisieren ihr Badge. */
chat.post("/:id/read", async (c) => {
  const id = uuid(c.req.param("id"));
  const userId = c.get("userId");
  await requireMembers(id, userId);
  await db.update(conversationMembers).set({ lastReadAt: new Date() }).where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, userId)));
  await publish({ users: [userId] }, { type: "chat.read", conversationId: id });
  return c.body(null, 204);
});

/** „schreibt …“ – REST-Variante für den SSE-Rückfall (bei WebSocket läuft es über die Verbindung). */
chat.post("/:id/typing", async (c) => {
  const id = uuid(c.req.param("id"));
  await requireMembers(id, c.get("userId"));
  await announceTyping(c.get("userId"), id);
  return c.body(null, 204);
});

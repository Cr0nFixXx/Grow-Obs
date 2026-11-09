import { Hono } from "hono";
import { and, desc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { MEDIA_PATH, imageRef } from "../lib/media-ref.ts";
import { releaseMedia } from "../lib/media-cleanup.ts";
import { db } from "../db/client.ts";
import { conversationMembers, conversationTopics, conversations, media, messages, topicUserState, users, type MessageAttachment } from "../db/schema.ts";
import { requireAuth, type AuthEnv } from "../middleware/auth.ts";
import { rateLimit, userKey } from "../middleware/rate-limit.ts";
import { ago } from "../lib/time.ts";
import { pageLimit, uuid } from "../lib/validation.ts";
import { onlineAmong, publish } from "../realtime/hub.ts";
import { pushChatMessage } from "../lib/push.ts";
import { canWrite, defaultTopic, groupUnreadByTopic, mutedUsers, requireAccess, requireTopic, topicAudience, visibleTopics } from "../lib/chat-groups.ts";
import { chatGroups } from "./chat-groups.ts";
import { announceTyping } from "../realtime/commands.ts";

export const chat = new Hono<AuthEnv>();
chat.use("*", requireAuth);
// Gruppen, Themen, Einladungen (B-65) – vor den `/:id/…`-Routen eingehängt.
chat.route("/", chatGroups);

export interface ConversationDto {
  id: string; name: string; avatar: string; online: boolean; last: string; time: string; unread: number;
  isGroup: boolean; partnerId: string | null; partnerHandle: string | null;
  /** Gruppen: eigene Rolle und Mitgliederzahl (Direktnachrichten: null/2). */
  role: "admin" | "moderator" | "member" | null; memberCount: number;
}

/** Konversationen des Nutzers (neueste Aktivität zuerst) mit Gegenstelle, Online-Status und ungelesenen Nachrichten. */
async function conversationList(userId: string, opts: { ids?: string[]; limit?: number; includeEmpty?: boolean } = {}): Promise<ConversationDto[]> {
  const mine = await db.select({ cv: conversations, role: conversationMembers.role })
    .from(conversationMembers).innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(and(eq(conversationMembers.userId, userId), opts.ids ? inArray(conversations.id, opts.ids) : undefined));
  if (!mine.length) return [];
  const ids = mine.map((m) => m.cv.id);

  const members = await db.select({ conversationId: conversationMembers.conversationId, id: users.id, name: users.name, handle: users.handle, avatar: users.avatarUrl })
    .from(conversationMembers).innerJoin(users, eq(users.id, conversationMembers.userId)).where(inArray(conversationMembers.conversationId, ids));
  // Letzte sichtbare Nachricht: in Gruppen nur ab Beitritt (außer Verlauf offen) und nur aus Themen, die der Nutzer sehen darf.
  const lastRows = await db.execute<{ conversation_id: string; text: string; image_url: string | null; attachments: MessageAttachment[] | null; created_at: Date; kind: string; sender_id: string | null; sender_name: string | null; deleted_at: Date | null }>(sql`
    SELECT DISTINCT ON (m.conversation_id) m.conversation_id, m.text, m.image_url, m.attachments, m.deleted_at, m.created_at, m.kind, m.sender_id, u.name AS sender_name
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ${userId}
    LEFT JOIN conversation_topics t ON t.id = m.topic_id
    LEFT JOIN users u ON u.id = m.sender_id
    WHERE m.conversation_id IN ${ids} AND (NOT c.is_group OR (
      (c.history_visible OR m.created_at >= cm.joined_at) AND t.id IS NOT NULL
      AND (NOT t.is_private OR cm.role = 'admin' OR EXISTS (SELECT 1 FROM topic_members tm WHERE tm.topic_id = t.id AND tm.user_id = ${userId}))))
    ORDER BY m.conversation_id, m.created_at DESC`);
  const unreadRows = await db.execute<{ conversation_id: string; n: number }>(sql`
    SELECT m.conversation_id, count(*)::int AS n FROM messages m
    JOIN conversations c ON c.id = m.conversation_id AND NOT c.is_group
    JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ${userId}
    WHERE m.conversation_id IN ${ids} AND m.sender_id <> ${userId} AND m.created_at > cm.last_read_at GROUP BY m.conversation_id`);
  const last = new Map(lastRows.map((r) => [r.conversation_id, r]));
  const unread = new Map(unreadRows.map((r) => [r.conversation_id, r.n]));
  // Gruppen: Summe der Themen ohne stumm geschaltete.
  for (const g of await groupUnreadByTopic(userId, ids)) if (!g.muted) unread.set(g.conversationId, (unread.get(g.conversationId) ?? 0) + g.n);
  const memberCounts = new Map<string, number>();
  for (const m of members) memberCounts.set(m.conversationId, (memberCounts.get(m.conversationId) ?? 0) + 1);
  const partners = new Map<string, { id: string; name: string; handle: string; avatar: string | null }>();
  for (const cv of mine.map((m) => m.cv).filter((c) => !c.isGroup)) {
    const others = members.filter((m) => m.conversationId === cv.id && m.id !== userId);
    if (others.length === 1) partners.set(cv.id, others[0]!);
  }
  const online = await onlineAmong([...new Set([...partners.values()].map((p) => p.id))]);

  const rows = mine
    .filter(({ cv }) => opts.includeEmpty || cv.isGroup || last.has(cv.id) || cv.createdBy === userId || cv.createdBy === null)
    .map(({ cv, role }) => {
      const partner = partners.get(cv.id);
      const lastMessage = last.get(cv.id);
      const at = new Date(lastMessage?.created_at ?? cv.createdAt).getTime();
      const dto: ConversationDto = {
        id: cv.id,
        name: partner?.name ?? cv.name,
        avatar: partner ? (partner.avatar ?? "") : (cv.avatarUrl ?? ""),
        online: partner ? online.has(partner.id) : false,
        last: lastMessage ? lastPreview(lastMessage, cv.isGroup, userId) : "",
        time: lastMessage ? ago(lastMessage.created_at) : "",
        unread: unread.get(cv.id) ?? 0,
        isGroup: cv.isGroup,
        partnerId: partner?.id ?? null,
        partnerHandle: partner?.handle ?? null,
        role: cv.isGroup ? role : null,
        memberCount: memberCounts.get(cv.id) ?? 0,
      };
      return { dto, at };
    })
    .sort((a, b) => b.at - a.at);
  return rows.slice(0, opts.limit ?? 200).map((r) => r.dto);
}

/** Kurztext für Nachrichten ohne Text: „📷 Bild“, „📷 3 Bilder“, „📎 Datei.pdf“, „📎 2 Dateien“. */
export function attachmentLabel(attachments: MessageAttachment[], imageUrl: string | null): string {
  const list = attachments.length ? attachments : imageUrl ? [{ kind: "image" as const, name: "" }] : [];
  const images = list.filter((a) => a.kind === "image").length;
  const files = list.filter((a) => a.kind === "file");
  if (!list.length) return "";
  if (!files.length) return images === 1 ? "📷 Bild" : `📷 ${images} Bilder`;
  if (!images) return files.length === 1 ? `📎 ${files[0]!.name || "Datei"}` : `📎 ${files.length} Dateien`;
  return `📎 ${list.length} Anhänge`;
}

/** Vorschauzeile der Konversationsliste; in Gruppen mit Absender („Anna: Hallo“), Hinweiszeilen ohne Präfix. */
function lastPreview(m: { text: string; image_url: string | null; attachments: MessageAttachment[] | null; kind: string; sender_id: string | null; sender_name: string | null; deleted_at?: Date | null }, isGroup: boolean, userId: string): string {
  const text = m.deleted_at ? "🚫 Nachricht gelöscht" : m.text || attachmentLabel(m.attachments ?? [], m.image_url);
  if (!isGroup || m.kind === "system") return text;
  const who = m.sender_id === userId ? "Du" : (m.sender_name ?? "").split(" ")[0] || "Jemand";
  return `${who}: ${text}`;
}

chat.get("/", async (c) => c.json(await conversationList(c.get("userId"), { limit: pageLimit(c.req.query("limit")) })));

/** Gesamtzahl ungelesener Nachrichten (Badge in der Navigation). */
chat.get("/unread", async (c) => {
  const userId = c.get("userId");
  const [row] = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM messages m
    JOIN conversations cv ON cv.id = m.conversation_id AND NOT cv.is_group
    JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ${userId}
    WHERE m.sender_id <> ${userId} AND m.created_at > cm.last_read_at`);
  const groups = (await groupUnreadByTopic(userId)).filter((g) => !g.muted).reduce((sum, g) => sum + g.n, 0);
  return c.json({ total: (row?.n ?? 0) + groups });
});

/** Personensuche für „Neue Nachricht“ (mind. 2 Zeichen, höchstens 10 Treffer, ohne sich selbst). */
chat.get("/users", rateLimit({ name: "chat-users", limit: 60, windowMs: 60_000, keys: userKey }), async (c) => {
  const q = (c.req.query("q") ?? "").trim().slice(0, 50);
  if (q.length < 2) return c.json([]);
  const pattern = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
  const rows = await db.select({ id: users.id, name: users.name, handle: users.handle, avatar: users.avatarUrl }).from(users)
    .where(and(ne(users.id, c.get("userId")), isNull(users.deletedAt), or(ilike(users.name, pattern), ilike(users.handle, pattern)))).orderBy(users.name).limit(10);
  return c.json(rows.map((r) => ({ id: r.id, name: r.name, handle: r.handle, avatar: r.avatar ?? "" })));
});

/** Direktnachricht mit einer Person starten bzw. die bestehende öffnen (idempotent, ein Chat je Paar). */
chat.post("/", rateLimit({ name: "chat-start", limit: 30, windowMs: 10 * 60_000, keys: userKey }), async (c) => {
  const me = c.get("userId");
  const body = z.object({ userId: z.string().uuid() }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültige Daten" }, 400);
  if (body.data.userId === me) return c.json({ error: "Du kannst dir nicht selbst schreiben" }, 400);
  const [partner] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, body.data.userId), isNull(users.deletedAt))).limit(1);
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

type Sender = { name: string | null; handle?: string | null; avatar?: string | null };
/** Zitat einer beantworteten Nachricht (B-94): gekürzter Text, nie der Inhalt gelöschter Nachrichten. */
interface ReplyDto { id: string; from: "me" | "them"; senderName: string; text: string; hasAttachment: boolean; deleted: boolean }
const QUOTE_MAX = 140;

async function loadReplies(rows: (typeof messages.$inferSelect)[], userId: string): Promise<Map<string, ReplyDto>> {
  const ids = [...new Set(rows.map((m) => m.replyTo).filter((x): x is string => !!x))];
  const out = new Map<string, ReplyDto>();
  if (!ids.length) return out;
  const found = await db.select({ m: messages, name: users.name }).from(messages).leftJoin(users, eq(users.id, messages.senderId)).where(inArray(messages.id, ids));
  for (const r of found) {
    const gone = !!r.m.deletedAt;
    out.set(r.m.id, {
      id: r.m.id, from: r.m.senderId === userId ? "me" : "them", senderName: r.name ?? "", deleted: gone,
      text: gone ? "" : r.m.text.slice(0, QUOTE_MAX), hasAttachment: !gone && (r.m.attachments.length > 0 || !!r.m.imageUrl),
    });
  }
  return out;
}

/** Nachricht für die Oberfläche; `senderName` zeigt die Gruppenansicht, `kind: "system"` sind Hinweiszeilen. */
function messageDto(m: typeof messages.$inferSelect, userId: string, sender: Sender | string | null, now = false, replies?: Map<string, ReplyDto>) {
  const s: Sender = typeof sender === "string" || sender === null ? { name: sender } : sender;
  const who = { senderId: m.senderId, senderName: s.name ?? "", senderHandle: s.handle ?? "", senderAvatar: s.avatar ?? "" };
  const replyTo = m.replyTo ? replies?.get(m.replyTo) ?? null : null;
  // Gelöschte Nachricht (B-82): nur noch Platzhalter, nie Inhalt ausliefern.
  if (m.deletedAt) {
    return {
      id: m.id, from: m.senderId === userId ? "me" : "them", text: "", image: undefined, attachments: [] as MessageAttachment[], deleted: true,
      time: now ? "jetzt" : ago(m.createdAt), createdAt: m.createdAt.toISOString(),
      ...who, kind: "user" as const, topicId: m.topicId, replyTo: null,
    };
  }
  // Ältere Nachrichten haben nur `image_url`: als einzelnes Bild-Anhang ausgeben.
  const attachments: MessageAttachment[] = m.attachments.length ? m.attachments : m.imageUrl ? [{ path: m.imageUrl, kind: "image", name: "", size: 0, mime: "" }] : [];
  return {
    id: m.id, from: m.senderId === userId ? "me" : "them", text: m.text, image: m.imageUrl ?? undefined, attachments, deleted: false,
    time: now ? "jetzt" : ago(m.createdAt), createdAt: m.createdAt.toISOString(),
    ...who, kind: m.kind === "system" ? "system" : "user", topicId: m.topicId, replyTo,
  };
}

chat.get("/:id/messages", async (c) => {
  const userId = c.get("userId");
  const id = uuid(c.req.param("id"));
  const access = await requireAccess(id, userId);
  const limit = pageLimit(c.req.query("limit"));
  const conds = [eq(messages.conversationId, id)];
  if (access.cv.isGroup) {
    // Thema (Standard: „Allgemein“), nur wenn sichtbar; ohne offenen Verlauf nur ab Beitritt.
    const topicId = c.req.query("topicId");
    const topic = topicId ? await requireTopic(id, uuid(topicId), access) : await defaultTopic(id);
    conds.push(eq(messages.topicId, topic.id));
    if (!access.cv.historyVisible) conds.push(sql`${messages.createdAt} >= ${access.me.joinedAt.toISOString()}::timestamptz`);
  }
  const rows = await db.select({ m: messages, senderName: users.name, senderHandle: users.handle, senderAvatar: users.avatarUrl }).from(messages).leftJoin(users, eq(users.id, messages.senderId))
    .where(and(...conds)).orderBy(desc(messages.createdAt)).limit(limit);
  const replies = await loadReplies(rows.map((r) => r.m), userId);
  return c.json(rows.reverse().map((r) => messageDto(r.m, userId, { name: r.senderName, handle: r.senderHandle, avatar: r.senderAvatar }, false, replies)));
});

chat.post("/:id/messages", rateLimit({ name: "chat-send", limit: 90, windowMs: 60_000, keys: userKey }), async (c) => {
  const id = uuid(c.req.param("id"));
  const userId = c.get("userId");
  const access = await requireAccess(id, userId);
  if (!access.cv.isGroup) {
    const partnerId = access.memberIds.find((memberId) => memberId !== userId);
    const [partner] = partnerId ? await db.select({ deletedAt: users.deletedAt }).from(users).where(eq(users.id, partnerId)).limit(1) : [];
    if (partner?.deletedAt) return c.json({ error: "Dieses Mitglied hat sein Konto gelöscht." }, 409);
  }
  const body = z.object({
    text: z.string().trim().max(10000).default(""),
    image: imageRef.optional(),
    /** Eigene Uploads (`/media/<id>`), höchstens 10; Art, Name und Größe stammen aus der Datenbank, nicht vom Client. */
    attachments: z.array(z.string().regex(MEDIA_PATH)).max(10).optional(),
    topicId: z.string().uuid().optional(),
    /** B-94: Nachricht, auf die geantwortet wird (gleiche Unterhaltung und, in Gruppen, gleiches Thema). */
    replyTo: z.string().uuid().optional(),
  })
    .refine((v) => v.text.length > 0 || !!v.image || !!v.attachments?.length, "Text oder Anhang erforderlich")
    .safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültige Daten" }, 400);
  const paths = [...new Set(body.data.attachments ?? [])];
  let attachments: MessageAttachment[] = [];
  if (paths.length) {
    const rows = await db.select({ id: media.id, contentType: media.contentType, size: media.size, fileName: media.fileName })
      .from(media).where(and(inArray(media.id, paths.map((p) => p.slice("/media/".length))), eq(media.ownerId, userId)));
    const byId = new Map(rows.map((r) => [r.id, r]));
    attachments = paths.flatMap((path) => {
      const row = byId.get(path.slice("/media/".length));
      return row ? [{ path, kind: row.contentType.startsWith("image/") ? "image" as const : "file" as const, name: row.fileName ?? "", size: row.size, mime: row.contentType }] : [];
    });
    if (attachments.length !== paths.length) return c.json({ error: "Ein Anhang wurde nicht gefunden – bitte erneut hochladen" }, 400);
  }
  let topic = null;
  if (access.cv.isGroup) {
    topic = body.data.topicId ? await requireTopic(id, body.data.topicId, access) : await defaultTopic(id);
    if (!canWrite(topic, access.isAdmin)) return c.json({ error: topic.closed ? "Dieses Thema ist geschlossen" : "In diesem Thema dürfen nur Admins schreiben" }, 403);
  }
  if (body.data.replyTo) {
    const [target] = await db.select({ conversationId: messages.conversationId, topicId: messages.topicId, deletedAt: messages.deletedAt, kind: messages.kind })
      .from(messages).where(eq(messages.id, body.data.replyTo)).limit(1);
    if (!target || target.conversationId !== id || target.deletedAt || target.kind === "system" || (topic && target.topicId !== topic.id)) {
      return c.json({ error: "Die Nachricht, auf die du antwortest, gibt es nicht mehr." }, 400);
    }
  }
  const [m] = await db
    .insert(messages)
    .values({ conversationId: id, senderId: userId, replyTo: body.data.replyTo ?? null, text: body.data.text, imageUrl: body.data.image ?? attachments.find((a) => a.kind === "image")?.path ?? null, attachments, topicId: topic?.id ?? null })
    .returning();
  // Anhänge gehören ab jetzt zu dieser Unterhaltung: Abruf nur noch für Mitglieder (B-82).
  const mediaIds = [...new Set([...attachments.map((a) => a.path), ...(m!.imageUrl && MEDIA_PATH.test(m!.imageUrl) ? [m!.imageUrl] : [])])].map((p) => p.slice("/media/".length));
  if (mediaIds.length) await db.update(media).set({ conversationId: id }).where(and(inArray(media.id, mediaIds), eq(media.ownerId, userId)));
  // Wer schreibt, hat den Chat bzw. das Thema gelesen (eigene Nachricht erhöht nie den eigenen Zähler).
  if (topic) {
    await db.insert(topicUserState).values({ topicId: topic.id, userId, lastReadAt: m!.createdAt }).onConflictDoUpdate({ target: [topicUserState.topicId, topicUserState.userId], set: { lastReadAt: m!.createdAt } });
  } else {
    await db.update(conversationMembers).set({ lastReadAt: m!.createdAt }).where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, userId)));
  }
  const audience = topic ? await topicAudience(access, topic) : access.memberIds;
  await publish({ users: audience }, { type: "chat.message", conversationId: id, ...(topic ? { topicId: topic.id } : {}), messageId: m!.id, senderId: userId });
  const group = topic ? { name: access.cv.name, topicId: topic.id, muted: await mutedUsers(topic.id) } : undefined;
  void pushChatMessage({ members: audience, senderId: userId, conversationId: id, text: m!.text, hasImage: !!m!.imageUrl, hasFile: attachments.some((a) => a.kind === "file"), group }).catch(() => undefined);
  return c.json(messageDto(m!, userId, null, true, await loadReplies([m!], userId)), 201);
});

/**
 * Nachricht löschen (B-82), für alle: Absender jederzeit; in Gruppen auch Admins. Text und Anhänge werden geleert (die Zeile bleibt als
 * Platzhalter „Nachricht gelöscht“), die Dateien aus dem Speicher entfernt. Hinweiszeilen lassen sich nicht löschen. Idempotent.
 */
chat.delete("/:id/messages/:messageId", rateLimit({ name: "chat-delete", limit: 60, windowMs: 60_000, keys: userKey }), async (c) => {
  const id = uuid(c.req.param("id"));
  const userId = c.get("userId");
  const access = await requireAccess(id, userId);
  const [m] = await db.select().from(messages).where(and(eq(messages.id, uuid(c.req.param("messageId"))), eq(messages.conversationId, id))).limit(1);
  if (!m) return c.json({ error: "Nachricht nicht gefunden" }, 404);
  if (m.kind === "system") return c.json({ error: "Hinweise lassen sich nicht löschen" }, 400);
  if (m.senderId !== userId && !(access.cv.isGroup && access.isAdmin)) return c.json({ error: "Du darfst nur eigene Nachrichten löschen" }, 403);
  if (m.deletedAt) return c.body(null, 204);
  const paths = [...new Set([...m.attachments.map((a) => a.path), ...(m.imageUrl ? [m.imageUrl] : [])])];
  await db.update(messages).set({ text: "", imageUrl: null, attachments: [], deletedAt: new Date() }).where(eq(messages.id, m.id));
  // Dateien freigeben: erst nach dem Leeren der Nachricht, damit die Verwendungsprüfung sie nicht mehr findet.
  for (const path of paths) await releaseMedia(m.senderId, path);
  const topic = m.topicId ? (await db.select().from(conversationTopics).where(eq(conversationTopics.id, m.topicId)).limit(1))[0] : undefined;
  const audience = topic ? await topicAudience(access, topic) : access.memberIds;
  await publish({ users: audience }, { type: "chat.message", conversationId: id, ...(m.topicId ? { topicId: m.topicId } : {}), messageId: m.id, senderId: m.senderId, deleted: true });
  return c.body(null, 204);
});

/** Leseposition setzen: alles bis jetzt gilt als gelesen (Gruppen: je Thema, ohne `topicId` alle sichtbaren Themen). Andere Geräte des Nutzers aktualisieren ihr Badge. */
chat.post("/:id/read", async (c) => {
  const id = uuid(c.req.param("id"));
  const userId = c.get("userId");
  const access = await requireAccess(id, userId);
  const now = new Date();
  if (access.cv.isGroup) {
    const parsed = z.object({ topicId: z.string().uuid().optional() }).safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Ungültige Daten" }, 400);
    const topics = parsed.data.topicId ? [await requireTopic(id, parsed.data.topicId, access)] : await visibleTopics(id, userId, access.isAdmin);
    if (topics.length) await db.insert(topicUserState).values(topics.map((t) => ({ topicId: t.id, userId, lastReadAt: now })))
      .onConflictDoUpdate({ target: [topicUserState.topicId, topicUserState.userId], set: { lastReadAt: now } });
  } else {
    await db.update(conversationMembers).set({ lastReadAt: now }).where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, userId)));
  }
  await publish({ users: [userId] }, { type: "chat.read", conversationId: id });
  return c.body(null, 204);
});

/** „schreibt …“ – REST-Variante für den SSE-Rückfall (bei WebSocket läuft es über die Verbindung). */
chat.post("/:id/typing", async (c) => {
  const id = uuid(c.req.param("id"));
  await requireAccess(id, c.get("userId"));
  const topicId = z.string().uuid().safeParse(((await c.req.json().catch(() => ({}))) as { topicId?: unknown }).topicId);
  await announceTyping(c.get("userId"), id, topicId.success ? topicId.data : undefined);
  return c.body(null, 204);
});

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "../db/client.ts";
import { conversationMembers, conversations, conversationTopics, messages, topicMembers, topicUserState } from "../db/schema.ts";
import { publish } from "../realtime/hub.ts";

/** Gruppenchats (B-65): Grenzen, Zugriffsregeln und gemeinsame Helfer für Routen, Nachrichten und Push. */
export const MAX_GROUP_MEMBERS = 20;
export const MAX_TOPICS = 50;
export const INVITE_TTL_MS = 7 * 24 * 3600_000;
/** Offene Einladungen, die eine Person gleichzeitig haben darf (Schutz vor Einladungsflut). */
export const MAX_PENDING_INVITES_PER_USER = 20;
export const DEFAULT_TOPIC_NAME = "Allgemein";

export type ConversationRow = typeof conversations.$inferSelect;
export type TopicRow = typeof conversationTopics.$inferSelect;
export type MemberRow = typeof conversationMembers.$inferSelect;

export type Access = { cv: ConversationRow; me: MemberRow; members: MemberRow[]; memberIds: string[]; isAdmin: boolean };

/** Konversation samt Mitgliedern; 404, wenn der Nutzer kein Mitglied ist (verrät nicht, dass es sie gibt). */
export async function requireAccess(conversationId: string, userId: string): Promise<Access> {
  const members = await db.select().from(conversationMembers).where(eq(conversationMembers.conversationId, conversationId));
  const me = members.find((m) => m.userId === userId);
  const [cv] = me ? await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1) : [];
  if (!me || !cv) throw new HTTPException(404, { message: "Konversation nicht gefunden" });
  return { cv, me, members, memberIds: members.map((m) => m.userId), isAdmin: me.role === "admin" };
}

/** Wie `requireAccess`, aber nur für Gruppen (Direktnachrichten haben weder Rollen noch Themen). */
export async function requireGroup(conversationId: string, userId: string): Promise<Access> {
  const access = await requireAccess(conversationId, userId);
  if (!access.cv.isGroup) throw new HTTPException(404, { message: "Gruppe nicht gefunden" });
  return access;
}
export function requireAdmin(access: Access): void {
  if (!access.isAdmin) throw new HTTPException(403, { message: "Nur Gruppen-Admins dürfen das" });
}

/** Wer ein Thema sehen darf: alle Mitglieder, bei privaten Themen nur dessen Mitglieder und die Gruppen-Admins. */
export async function topicAudience(access: Pick<Access, "members">, topic: Pick<TopicRow, "id" | "isPrivate">): Promise<string[]> {
  if (!topic.isPrivate) return access.members.map((m) => m.userId);
  const allowed = new Set((await db.select({ userId: topicMembers.userId }).from(topicMembers).where(eq(topicMembers.topicId, topic.id))).map((r) => r.userId));
  return access.members.filter((m) => m.role === "admin" || allowed.has(m.userId)).map((m) => m.userId);
}

/** Themen, die der Nutzer sehen darf (private nur als Mitglied oder Admin), sortiert: angeheftet, Reihenfolge, Alter. */
export async function visibleTopics(conversationId: string, userId: string, isAdmin: boolean): Promise<TopicRow[]> {
  const rows = await db.select().from(conversationTopics).where(eq(conversationTopics.conversationId, conversationId))
    .orderBy(asc(conversationTopics.position), asc(conversationTopics.createdAt));
  const privateIds = rows.filter((t) => t.isPrivate).map((t) => t.id);
  const mine = !isAdmin && privateIds.length
    ? new Set((await db.select({ topicId: topicMembers.topicId }).from(topicMembers).where(and(inArray(topicMembers.topicId, privateIds), eq(topicMembers.userId, userId)))).map((r) => r.topicId))
    : new Set<string>();
  return rows.filter((t) => !t.isPrivate || isAdmin || mine.has(t.id)).sort((a, b) => Number(b.pinned) - Number(a.pinned));
}

export async function requireTopic(conversationId: string, topicId: string, access: Access): Promise<TopicRow> {
  const [topic] = await db.select().from(conversationTopics).where(and(eq(conversationTopics.id, topicId), eq(conversationTopics.conversationId, conversationId))).limit(1);
  if (!topic) throw new HTTPException(404, { message: "Thema nicht gefunden" });
  if (topic.isPrivate && !access.isAdmin) {
    const [row] = await db.select({ userId: topicMembers.userId }).from(topicMembers).where(and(eq(topicMembers.topicId, topic.id), eq(topicMembers.userId, access.me.userId))).limit(1);
    if (!row) throw new HTTPException(404, { message: "Thema nicht gefunden" });
  }
  return topic;
}

export async function defaultTopic(conversationId: string): Promise<TopicRow> {
  const [topic] = await db.select().from(conversationTopics).where(and(eq(conversationTopics.conversationId, conversationId), eq(conversationTopics.isDefault, true))).limit(1);
  if (!topic) throw new HTTPException(500, { message: "Gruppe ohne Standardthema" });
  return topic;
}

/** Darf der Nutzer in dieses Thema schreiben? (geschlossen und „nur Admins“ sperren Nicht-Admins) */
export function canWrite(topic: Pick<TopicRow, "closed" | "adminsOnly">, isAdmin: boolean): boolean {
  return isAdmin || !(topic.closed || topic.adminsOnly);
}

/** Hinweiszeile im Verlauf (Standardthema oder angegebenes Thema). Kein Ungelesen-Zähler, kein Push. */
export async function postSystemMessage(access: Pick<Access, "members" | "cv">, actorId: string, text: string, topic?: TopicRow): Promise<void> {
  const target = topic ?? await defaultTopic(access.cv.id);
  const [m] = await db.insert(messages).values({ conversationId: access.cv.id, senderId: actorId, text, kind: "system", topicId: target.id }).returning({ id: messages.id });
  await publish({ users: await topicAudience(access, target) }, { type: "chat.message", conversationId: access.cv.id, topicId: target.id, messageId: m!.id, senderId: actorId });
}

/** Alle Mitglieder (und zusätzlich genannte Personen) laden die Gruppe neu: Mitglieder, Themen, Einladungen haben sich geändert. */
export async function announceGroupChange(conversationId: string, memberIds: string[], extra: string[] = []): Promise<void> {
  await publish({ users: [...new Set([...memberIds, ...extra])] }, { type: "chat.group", conversationId });
}

/** Nach dem Entfernen/Verlassen: Gruppe ohne Admin bekommt den ältesten Verbliebenen als Admin; ohne Mitglieder wird sie gelöscht. */
export async function repairAfterDeparture(conversationId: string): Promise<{ deleted: boolean; promoted?: string }> {
  const rest = await db.select().from(conversationMembers).where(eq(conversationMembers.conversationId, conversationId)).orderBy(asc(conversationMembers.joinedAt));
  if (!rest.length) {
    await db.transaction(async (tx) => {
      await tx.delete(messages).where(eq(messages.conversationId, conversationId));
      await tx.delete(conversations).where(eq(conversations.id, conversationId)); // Themen und Einladungen folgen per CASCADE
    });
    return { deleted: true };
  }
  if (!rest.some((m) => m.role === "admin")) {
    await db.update(conversationMembers).set({ role: "admin" }).where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, rest[0]!.userId)));
    return { deleted: false, promoted: rest[0]!.userId };
  }
  return { deleted: false };
}


/** Ungelesene Gruppennachrichten je Thema und Nutzer: nur fremde, echte Nachrichten (keine Hinweiszeilen) nach Beitritt/Lesestand in sichtbaren Themen. */
export async function groupUnreadByTopic(userId: string, conversationIds?: string[]): Promise<{ conversationId: string; topicId: string; n: number; muted: boolean }[]> {
  if (conversationIds && !conversationIds.length) return [];
  const scope = conversationIds ? sql`AND t.conversation_id IN ${conversationIds}` : sql``;
  const rows = await db.execute<{ conversation_id: string; topic_id: string; n: number; muted: boolean }>(sql`
    SELECT t.conversation_id, t.id AS topic_id, count(m.id)::int AS n, coalesce(s.muted, false) AS muted
    FROM conversation_topics t
    JOIN conversations c ON c.id = t.conversation_id AND c.is_group
    JOIN conversation_members cm ON cm.conversation_id = t.conversation_id AND cm.user_id = ${userId}
    LEFT JOIN topic_user_state s ON s.topic_id = t.id AND s.user_id = ${userId}
    LEFT JOIN messages m ON m.topic_id = t.id AND m.kind = 'user' AND m.sender_id <> ${userId}
      AND m.created_at > greatest(cm.joined_at, coalesce(s.last_read_at, cm.joined_at))
    WHERE (NOT t.is_private OR cm.role = 'admin' OR EXISTS (SELECT 1 FROM topic_members tm WHERE tm.topic_id = t.id AND tm.user_id = ${userId}))
    ${scope}
    GROUP BY t.conversation_id, t.id, s.muted`);
  return rows.map((r) => ({ conversationId: r.conversation_id, topicId: r.topic_id, n: r.n, muted: r.muted }));
}

/** Stumm geschaltete Mitglieder eines Themas (kein Push). */
export async function mutedUsers(topicId: string): Promise<Set<string>> {
  const rows = await db.select({ userId: topicUserState.userId }).from(topicUserState).where(and(eq(topicUserState.topicId, topicId), eq(topicUserState.muted, true)));
  return new Set(rows.map((r) => r.userId));
}

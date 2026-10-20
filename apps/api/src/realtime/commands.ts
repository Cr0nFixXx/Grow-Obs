import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import { conversationMembers, conversationTopics } from "../db/schema.ts";
import { topicAudience } from "../lib/chat-groups.ts";
import { applyTopic, isValidTopic, publish, publishControl, type Connection } from "./hub.ts";

/** Nachrichten Client → Server (identisch für WebSocket und die REST-Variante bei SSE). */
export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("subscribe"), topic: z.string().max(80) }),
  z.object({ type: z.literal("unsubscribe"), topic: z.string().max(80) }),
  z.object({ type: z.literal("typing"), conversationId: z.string().uuid(), topicId: z.string().uuid().optional() }),
  z.object({ type: z.literal("ping") }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

const TYPING_MIN_INTERVAL_MS = 2000;
const typingSeen = new Map<string, number>();
function typingAllowed(userId: string, conversationId: string, now = Date.now()): boolean {
  if (typingSeen.size > 5000) for (const [key, at] of typingSeen) if (now - at > TYPING_MIN_INTERVAL_MS) typingSeen.delete(key);
  const key = `${userId}:${conversationId}`;
  if (now - (typingSeen.get(key) ?? 0) < TYPING_MIN_INTERVAL_MS) return false;
  typingSeen.set(key, now);
  return true;
}
export function resetTypingThrottle() { typingSeen.clear(); }

/** „schreibt …“ an die anderen Mitglieder (nur für Mitglieder der Konversation, höchstens alle 2 s je Person und Chat). */
export async function announceTyping(userId: string, conversationId: string, topicId?: string): Promise<boolean> {
  if (!typingAllowed(userId, conversationId)) return false;
  const members = await db.select().from(conversationMembers).where(eq(conversationMembers.conversationId, conversationId));
  if (!members.some((m) => m.userId === userId)) return false;
  let audience = members.map((m) => m.userId);
  if (topicId) {
    // Gruppen (B-65): „schreibt …“ nur an Personen, die das Thema sehen (private Themen), und mit Themen-ID.
    const [topic] = await db.select().from(conversationTopics).where(and(eq(conversationTopics.id, topicId), eq(conversationTopics.conversationId, conversationId))).limit(1);
    if (!topic) return false;
    audience = await topicAudience({ members }, topic);
    if (!audience.includes(userId)) return false;
  }
  await publish({ users: audience.filter((id) => id !== userId) }, { type: "chat.typing", conversationId, userId, ...(topicId ? { topicId } : {}) });
  return true;
}

/** Wendet eine Nachricht an. `conn` ist gesetzt, wenn die Verbindung auf dieser Instanz liegt (WebSocket). */
export async function handleClientMessage(userId: string, message: ClientMessage, conn?: Connection, connId?: string): Promise<void> {
  switch (message.type) {
    case "ping":
      conn?.send({ type: "pong" });
      return;
    case "subscribe":
    case "unsubscribe":
      if (!isValidTopic(message.topic)) return;
      if (conn) applyTopic(conn, message.type, message.topic);
      else if (connId) await publishControl({ connId, userId, op: message.type, topic: message.topic });
      return;
    case "typing":
      await announceTyping(userId, message.conversationId, message.topicId);
      return;
  }
}


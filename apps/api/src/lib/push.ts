import webpush from "web-push";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { pushPrefs, pushSubscriptions, users } from "../db/schema.ts";
import { env } from "../env.ts";
import { onlineAmong } from "../realtime/hub.ts";
import { getFeatureOverrides } from "./features.ts";
import { buildMessage, DEFAULT_PREFS, inQuietHours, type PushCategory, type PushMessage, type PushPrefs } from "./push-core.ts";

/**
 * Web-Push (B-63): Versand an die Geräte eines Nutzers. Reihenfolge der Prüfungen (jede kann den Versand stoppen, die
 * In-App-Benachrichtigung bleibt davon unberührt): Betreiber-Konfiguration → Feature-Flag → Abos vorhanden → Kategorie →
 * Ruhezeit → Nutzer ist gerade online (dann sieht er es live in der App) → Drosselung gegen Flut.
 * Push ist ein Zusatz: Fehler hier dürfen nie eine Anfrage scheitern lassen.
 */
export type PushSubscriptionRecord = { endpoint: string; keys: { p256dh: string; auth: string } };
export type PushSender = (sub: PushSubscriptionRecord, payload: string, options: { ttl: number; urgency: "very-low" | "low" | "normal" | "high"; topic: string }) => Promise<void>;
export type PushResult = { sent: number; skipped?: "not-configured" | "feature-off" | "no-subscriptions" | "category-off" | "quiet-hours" | "online" | "throttled" };

export const pushConfigured = (): boolean => !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
export const vapidPublicKey = (): string | null => (pushConfigured() ? env.VAPID_PUBLIC_KEY! : null);

const realSender: PushSender = async (sub, payload, o) => {
  await webpush.sendNotification(sub, payload, {
    TTL: o.ttl, urgency: o.urgency, topic: o.topic, timeout: 10_000,
    vapidDetails: { subject: env.VAPID_SUBJECT!, publicKey: env.VAPID_PUBLIC_KEY!, privateKey: env.VAPID_PRIVATE_KEY! },
  });
};
let sender: PushSender = realSender;
/** Nur für Tests: Versand ersetzen (kein Netzwerk). `null` stellt den echten Versand wieder her. */
export function setPushSender(fn: PushSender | null): void { sender = fn ?? realSender; }

/** Drosselung je Gerät-Gruppe: höchstens ein Push je Nutzer und Tag-Gruppe alle 15 s (pro Prozess). */
const THROTTLE_MS = 15_000;
const lastSent = new Map<string, number>();
export function resetPushThrottle(): void { lastSent.clear(); }
function throttled(key: string, now: number): boolean {
  if (lastSent.size > 5000) for (const [k, t] of lastSent) if (now - t > THROTTLE_MS) lastSent.delete(k);
  const prev = lastSent.get(key);
  if (prev !== undefined && now - prev < THROTTLE_MS) return true;
  lastSent.set(key, now);
  return false;
}

export async function getPrefs(userId: string): Promise<PushPrefs> {
  const [row] = await db.select().from(pushPrefs).where(eq(pushPrefs.userId, userId)).limit(1);
  if (!row) return { ...DEFAULT_PREFS };
  return { messages: row.messages, community: row.community, grows: row.grows, other: row.other, showPreview: row.showPreview, quietEnabled: row.quietEnabled, quietStart: row.quietStart, quietEnd: row.quietEnd, timezone: row.timezone };
}

export type PushInput = { category: PushCategory; title: string; body?: string; url: string; tag?: string };
/** `force`: Einstellungen/Ruhezeit/Online ignorieren (Test-Push). `preview` überschreibt die Vorschau-Einstellung. */
export type PushOptions = { force?: boolean; preview?: boolean; now?: Date };

export async function sendPushToUser(userId: string, input: PushInput, options: PushOptions = {}): Promise<PushResult> {
  if (!pushConfigured()) return { sent: 0, skipped: "not-configured" };
  if (!options.force && (await getFeatureOverrides()).push === false) return { sent: 0, skipped: "feature-off" };
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  if (!subs.length) return { sent: 0, skipped: "no-subscriptions" };
  const prefs = await getPrefs(userId);
  if (!options.force) {
    if (!prefs[input.category]) return { sent: 0, skipped: "category-off" };
    if (inQuietHours(prefs, options.now ?? new Date())) return { sent: 0, skipped: "quiet-hours" };
    if ((await onlineAmong([userId])).has(userId)) return { sent: 0, skipped: "online" };
    if (throttled(`${userId}:${input.tag ?? input.category}`, Date.now())) return { sent: 0, skipped: "throttled" };
  }
  const message: PushMessage = buildMessage({ ...input, preview: options.preview ?? prefs.showPreview });
  const payload = JSON.stringify(message);
  const urgency = input.category === "messages" ? "high" : "normal";
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await sender({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { ttl: 24 * 3600, urgency, topic: message.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || "go" });
      sent++;
      await db.update(pushSubscriptions).set({ lastSuccessAt: new Date(), failureCount: 0 }).where(eq(pushSubscriptions.id, s.id));
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) { await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id)); return; }
      // Vorübergehender Fehler: zählen, nach 5 Fehlschlägen in Folge Abo entfernen (totes Gerät).
      const [row] = await db.update(pushSubscriptions).set({ failureCount: sql`${pushSubscriptions.failureCount} + 1` }).where(eq(pushSubscriptions.id, s.id)).returning({ n: pushSubscriptions.failureCount });
      if (row && row.n >= 5) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
      console.error(JSON.stringify({ event: "push_send_failed", status: status ?? null }));
    }
  }));
  return { sent };
}

/** Fire-and-forget für Aufrufer in Anfragen: nie werfen, nie warten. Gibt das Promise für Tests zurück. */
export function pushInBackground(userId: string, input: PushInput): Promise<PushResult | null> {
  return sendPushToUser(userId, input).catch((error) => {
    console.error(JSON.stringify({ event: "push_failed", message: error instanceof Error ? error.message : "unknown" }));
    return null;
  });
}

/**
 * Neue Chatnachricht → Push an die anderen Empfänger (Kategorie `messages`; mit Vorschau: Absender + Textanfang, in Gruppen
 * Gruppenname als Titel und „Absender: Text“). `members` sind bereits die Personen, die das Thema sehen; stumm geschaltete
 * Themen (`topicId`) erhalten keinen Push.
 */
export async function pushChatMessage(args: { members: string[]; senderId: string; conversationId: string; text: string; hasImage: boolean; group?: { name: string; topicId: string; muted: Set<string> } }): Promise<void> {
  const recipients = args.members.filter((id) => id !== args.senderId && !args.group?.muted.has(id));
  if (!recipients.length || !pushConfigured()) return;
  const [sender] = await db.select({ name: users.name }).from(users).where(eq(users.id, args.senderId)).limit(1);
  const snippet = args.text.trim() ? args.text.trim().replace(/\s+/g, " ") : (args.hasImage ? "Bild" : "");
  const title = args.group ? (args.group.name || "Gruppe") : (sender?.name ?? "Neue Nachricht");
  const body = args.group ? `${sender?.name ?? "Jemand"}: ${snippet}` : snippet;
  const tag = `go-chat-${args.conversationId.slice(0, 8)}${args.group ? `-${args.group.topicId.slice(0, 8)}` : ""}`;
  await Promise.all(recipients.map((id) => pushInBackground(id, { category: "messages", title, body, url: "/chat", tag })));
}

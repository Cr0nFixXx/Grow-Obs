import type { ChatMessage, GroupDetail, GroupTopic } from "@/services/interfaces";

/** Reine Hilfen für Gruppenchats (B-65) – ohne Oberfläche, damit sie sich einzeln testen lassen. */

export const MAX_GROUP_NAME = 60;
export const MAX_TOPIC_NAME = 40;
export const MAX_GROUP_MEMBERS = 20;

export const isAdmin = (role: GroupDetail["role"] | null | undefined): boolean => role === "admin";

/** Warum darf ich in diesem Thema nicht schreiben? `null` = ich darf. */
export function writeBlockReason(topic: Pick<GroupTopic, "canWrite" | "closed" | "adminsOnly"> | null | undefined): string | null {
  if (!topic || topic.canWrite) return null;
  return topic.closed ? "Dieses Thema ist geschlossen. Nur Admins können noch schreiben." : "In diesem Thema schreiben nur Admins (Ankündigungen).";
}

/** Das Thema, das gerade offen ist: gewähltes, sonst „Allgemein“, sonst das erste. */
export function resolveTopic(topics: GroupTopic[], selectedId: string | null | undefined): GroupTopic | null {
  return topics.find((t) => t.id === selectedId) ?? topics.find((t) => t.isDefault) ?? topics[0] ?? null;
}

/** Ungelesen in der Konversationsliste: stumm geschaltete Themen zählen nicht (wie der Server). */
export function unreadOutsideMuted(topics: Pick<GroupTopic, "unread" | "muted">[]): number {
  return topics.reduce((sum, t) => sum + (t.muted ? 0 : t.unread), 0);
}

/** Unterschiedliche Absender in Folge: Name nur über der ersten Nachricht einer Serie anzeigen (nicht bei eigenen Nachrichten). */
export function showSenderName(messages: Pick<ChatMessage, "from" | "senderId" | "kind">[], index: number): boolean {
  const m = messages[index];
  if (!m || m.from === "me" || m.kind === "system") return false;
  const prev = messages[index - 1];
  return !prev || prev.kind === "system" || prev.senderId !== m.senderId;
}

/** „läuft in 3 Tagen ab“ (aufgerundet) / „läuft heute ab“ (unter 24 h) / „abgelaufen“. */
export function expiryLabel(expiresAt: string, now: number = Date.now()): string {
  const ms = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return "abgelaufen";
  if (ms < 24 * 3600_000) return "läuft heute ab";
  return `läuft in ${Math.ceil(ms / 86_400_000)} Tagen ab`;
}

/** Freie Plätze: Mitglieder plus offene Einladungen zählen gegen die Obergrenze. */
export function freeSlots(group: Pick<GroupDetail, "memberCount" | "invites" | "maxMembers">): number {
  return Math.max(0, group.maxMembers - group.memberCount - group.invites.length);
}

/** Kurzbeschreibung der Einstellungen eines Themas für Chips und Listen. */
export function topicBadges(topic: Pick<GroupTopic, "private" | "adminsOnly" | "closed" | "pinned" | "muted">): string[] {
  const out: string[] = [];
  if (topic.pinned) out.push("angeheftet");
  if (topic.private) out.push("privat");
  if (topic.closed) out.push("geschlossen");
  else if (topic.adminsOnly) out.push("nur Admins");
  if (topic.muted) out.push("stumm");
  return out;
}

/** Ergebnis einer Einladung in einen Satz für die Rückmeldung. */
export function inviteSummary(result: { invited: string[]; skipped: { reason: string }[] }): string {
  const parts: string[] = [];
  if (result.invited.length) parts.push(result.invited.length === 1 ? "1 Einladung gesendet" : `${result.invited.length} Einladungen gesendet`);
  if (result.skipped.length) parts.push(`${result.skipped.length} übersprungen (${[...new Set(result.skipped.map((s) => s.reason.toLowerCase()))].join(", ")})`);
  return parts.join(" · ") || "Nichts zu tun";
}

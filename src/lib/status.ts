import { LIVE_TEXT_MAX, STATUS_TEXT_MAX, type StatusVisibility } from "@/services/interfaces";

/** Livestatus (B-97): reine Hilfen für Anzeige und Eingabe. */

/** Schnellauswahl für das Emoji des Textstatus. */
export const STATUS_EMOJIS = ["🌱", "🌿", "🔥", "💧", "🌸", "✂️", "☕", "😴", "🚀", "🧪"];

export const STATUS_VISIBILITY_OPTIONS: { value: StatusVisibility; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "followers", label: "Nur Follower" },
  { value: "nobody", label: "Niemand" },
];

export const STATUS_VISIBILITY_DESC: Record<StatusVisibility, string> = {
  all: "Alle, die dein Profil sehen dürfen.",
  followers: "Nur Mitglieder, die dir folgen (und dein Profil sehen dürfen).",
  nobody: "Nur du siehst ihn.",
};

/** Restzeit eines 24h-Status: „noch 3 Std. 20 Min.“, „noch 12 Min.“, `null` = abgelaufen. */
export function liveRemaining(expiresAt: string | null | undefined, now: Date = new Date()): string | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `noch ${m} Min.`;
  return m === 0 ? `noch ${h} Std.` : `noch ${h} Std. ${m} Min.`;
}

/** Ist der 24h-Status noch aktiv (nicht abgelaufen, hat Text oder Foto)? */
export function liveIsActive(live: { text: string; image: string; expiresAt: string } | null | undefined, now: Date = new Date()): boolean {
  return !!live && (live.text !== "" || live.image !== "") && liveRemaining(live.expiresAt, now) !== null;
}

/** Eingabe prüfen; liefert eine Fehlermeldung oder `""`. */
export const statusTextError = (text: string) => (text.trim().length > STATUS_TEXT_MAX ? `Höchstens ${STATUS_TEXT_MAX} Zeichen.` : "");
export const liveTextError = (text: string, hasImage: boolean) =>
  text.trim().length > LIVE_TEXT_MAX ? `Höchstens ${LIVE_TEXT_MAX} Zeichen.` : !text.trim() && !hasImage ? "Schreibe einen Text oder füge ein Foto hinzu." : "";

/** Kopfzeile eines Textstatus als eine Zeile („🌱 Woche 3 Blüte“). */
export const statusLabel = (s: { emoji: string; text: string } | null | undefined) => (s ? `${s.emoji} ${s.text}`.trim() : "");

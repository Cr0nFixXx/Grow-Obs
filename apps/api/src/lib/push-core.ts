/**
 * Web-Push, reine Logik (B-63): Kategorien, Ruhezeit, Nachrichteninhalt. Keine Datenbank, kein Netzwerk → direkt testbar.
 */
export const PUSH_CATEGORIES = ["messages", "community", "grows", "other"] as const;
export type PushCategory = (typeof PUSH_CATEGORIES)[number];

export type NotifType = "grow" | "task" | "forum" | "shop" | "ai" | "system";

/** Kategorie einer In-App-Benachrichtigung. Direktnachrichten sind eine eigene Kategorie (`messages`). */
export function categoryOfNotification(type: NotifType): PushCategory {
  switch (type) {
    case "forum": return "community";
    case "grow": case "task": return "grows";
    default: return "other";
  }
}

/** Ziel-Ansicht beim Antippen (die App löst sie über ihr Routing auf). Nur Pfade der App, nie fremde URLs. */
export function targetPath(type: NotifType | "chat"): string {
  switch (type) {
    case "chat": return "/chat";
    case "forum": return "/forum";
    case "grow": return "/grows";
    case "task": return "/";
    case "shop": return "/marketplace";
    case "ai": return "/ai";
    default: return "/notifications";
  }
}

export type PushPrefs = {
  messages: boolean; community: boolean; grows: boolean; other: boolean;
  showPreview: boolean;
  quietEnabled: boolean; quietStart: number; quietEnd: number; timezone: string;
};

export const DEFAULT_PREFS: PushPrefs = {
  messages: true, community: true, grows: true, other: true, showPreview: false,
  quietEnabled: false, quietStart: 22 * 60, quietEnd: 7 * 60, timezone: "Europe/Berlin",
};

export const isValidTimezone = (tz: string): boolean => {
  try { new Intl.DateTimeFormat("de-DE", { timeZone: tz }); return true; } catch { return false; }
};

/** Minuten seit Mitternacht in der Zeitzone des Nutzers (ungültige Zeitzone → UTC). */
export function minutesOfDay(now: Date, timezone: string): number {
  const tz = isValidTimezone(timezone) ? timezone : "UTC";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0), m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

/** Liegt `now` in der Ruhezeit? Fenster über Mitternacht (z. B. 22:00–07:00) werden unterstützt; Start = Ende → nie. */
export function inQuietHours(prefs: Pick<PushPrefs, "quietEnabled" | "quietStart" | "quietEnd" | "timezone">, now: Date): boolean {
  if (!prefs.quietEnabled || prefs.quietStart === prefs.quietEnd) return false;
  const t = minutesOfDay(now, prefs.timezone);
  return prefs.quietStart < prefs.quietEnd ? t >= prefs.quietStart && t < prefs.quietEnd : t >= prefs.quietStart || t < prefs.quietEnd;
}

const GENERIC: Record<PushCategory, { title: string; body: string }> = {
  messages: { title: "Neue Nachricht", body: "Öffne Grow|Obs, um sie zu lesen." },
  community: { title: "Neue Aktivität in der Community", body: "Öffne Grow|Obs für Details." },
  grows: { title: "Neues zu deinem Grow", body: "Öffne Grow|Obs für Details." },
  other: { title: "Neue Benachrichtigung", body: "Öffne Grow|Obs für Details." },
};

export type PushMessage = { title: string; body: string; url: string; tag: string; category: PushCategory };

/**
 * Inhalt der Push-Nachricht. Standard ist neutral (kein Name, kein Text auf dem Sperrbildschirm); mit „Vorschau“ der
 * echte Titel/Text (gekürzt). `tag` fasst gleichartige Hinweise zusammen (ersetzt statt zu stapeln).
 */
export function buildMessage(input: { category: PushCategory; title: string; body?: string; url: string; preview: boolean; tag?: string }): PushMessage {
  const g = GENERIC[input.category];
  const real = input.preview && input.title.trim().length > 0;
  return {
    title: (real ? input.title : g.title).slice(0, 80),
    body: (real ? (input.body ?? "") : g.body).slice(0, 140),
    url: input.url,
    tag: input.tag ?? `go-${input.category}`,
    category: input.category,
  };
}

/** Eingabe für Ruhezeit: "HH:MM" → Minuten; ungültig → null. */
export function parseClock(value: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
export const formatClock = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * Push-Dienste der Browser. Der Server sendet an die vom Client gemeldete URL → nur diese Hosts sind erlaubt
 * (sonst könnte ein Nutzer den Server beliebige Adressen aufrufen lassen, SSRF).
 */
const PUSH_HOSTS = ["fcm.googleapis.com", "push.services.mozilla.com", "notify.windows.com", "push.apple.com"];
export function isAllowedEndpoint(endpoint: string): boolean {
  if (endpoint.length > 2048) return false;
  let url: URL;
  try { url = new URL(endpoint); } catch { return false; }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  return PUSH_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
}

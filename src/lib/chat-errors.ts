/** Verständlicher Text für einen fehlgeschlagenen Sendeversuch (statt „Interner Fehler“ / „Failed to fetch“). */
export function sendErrorText(error: unknown): string {
  const raw = error instanceof Error ? error.message.trim() : typeof error === "string" ? error.trim() : "";
  if (!raw) return "Unbekannter Fehler. Bitte noch einmal versuchen.";
  if (/failed to fetch|networkerror|load failed|network request failed|offline|nicht erreichbar|zeitlimit/i.test(raw)) {
    return "Keine Verbindung zum Server. Prüfe dein Netz und versuche es noch einmal.";
  }
  if (/^interner fehler$|^internal (server )?error$|^http 5\d\d/i.test(raw)) {
    return "Der Server hatte kurz ein Problem. Versuche es gleich noch einmal.";
  }
  if (/zu viele|too many|rate/i.test(raw)) return "Zu viele Nachrichten in kurzer Zeit. Warte einen Moment.";
  return raw;
}

import raw from "@/data/whats-new.json";

/**
 * „Was ist neu“ je Aufgabe (B-95). Die Texte stehen in `src/data/whats-new.json` (neueste zuerst, 3–5 Stichpunkte)
 * und werden nach jeder Aufgabe zusammen mit `docs/CHANGELOG.md` gepflegt. Das Fenster erscheint einmal nach dem Update.
 */
export interface WhatsNewEntry {
  /** B-Nummer der Aufgabe, entspricht der Überschrift in `docs/CHANGELOG.md`. */
  id: string;
  /** ISO-Datum (YYYY-MM-DD). */
  date: string;
  title: string;
  notes: string[];
}

export const WHATS_NEW: WhatsNewEntry[] = raw as WhatsNewEntry[];

/** Ausführliche Änderungen je Aufgabe (öffentliches Repository). */
export const CHANGELOG_URL = "https://github.com/Cr0nFixXx/Grow-Obs/blob/main/docs/CHANGELOG.md";

/** Höchstens so viele ungesehene Einträge im automatischen Fenster. */
export const MAX_AUTO_ENTRIES = 3;

/**
 * Einträge, die neuer sind als der zuletzt gesehene. `null` → keine (frische Installation soll keine Altlasten sehen).
 * Unbekannte oder leere Kennung (Bestandsinstallation ohne gemerkten Stand, Speicher teilweise gelöscht) → nur der neueste
 * Eintrag, nie die ganze Historie.
 */
export function unseenChanges(entries: WhatsNewEntry[], seenId: string | null): WhatsNewEntry[] {
  if (seenId === null) return [];
  const at = entries.findIndex((e) => e.id === seenId);
  return at === -1 ? entries.slice(0, 1) : entries.slice(0, at);
}

/**
 * Inhalt beim manuellen Öffnen („Einstellungen → Was ist neu“): die Einträge, die das Fenster zuletzt automatisch gezeigt hat
 * (`batchIds`); ohne gemerkten Stand nur der neueste Eintrag. Älteres steht im Changelog.
 */
export function lastBatch(entries: WhatsNewEntry[], batchIds: string[] | null): WhatsNewEntry[] {
  const picked = batchIds?.length ? entries.filter((e) => batchIds.includes(e.id)) : [];
  return picked.length ? picked : entries.slice(0, 1);
}

/** Startzustand ohne gespeicherte Kennung: bestehende Installation (hat alte Update-Daten) → alles ungesehen, frisch → alles gesehen. */
export function initialSeenId(stored: string | null, existingInstall: boolean, entries: WhatsNewEntry[]): string | null {
  if (stored) return stored;
  return existingInstall ? "" : entries[0]?.id ?? null;
}

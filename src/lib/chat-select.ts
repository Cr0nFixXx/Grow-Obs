import type { ChatMessage, ChatReplyQuote } from "@/services/interfaces";

/** Normale, nicht gelöschte Nachricht (Hinweiszeilen und Platzhalter lassen sich nicht auswählen). */
export const isSelectable = (m: Pick<ChatMessage, "kind" | "deleted">) => m.kind !== "system" && !m.deleted;

export const canDeleteMessage = (m: Pick<ChatMessage, "kind" | "deleted" | "from">, groupAdmin: boolean) =>
  isSelectable(m) && (m.from === "me" || groupAdmin);

export interface SelectionActions { reply: boolean; copy: boolean; remove: boolean }

/**
 * Welche Aktionen die aktuelle Auswahl erlaubt: Antworten nur bei genau einer Nachricht (und wenn geschrieben werden darf),
 * Kopieren, sobald eine Nachricht Text hat, Löschen nur, wenn **alle** gewählten löschbar sind (eigene bzw. als Gruppen-Admin alle).
 */
export function selectionActions(selected: readonly ChatMessage[], opts: { groupAdmin: boolean; canWrite: boolean }): SelectionActions {
  return {
    reply: selected.length === 1 && opts.canWrite && isSelectable(selected[0]!),
    copy: selected.some((m) => !!m.text),
    remove: selected.length > 0 && selected.every((m) => canDeleteMessage(m, opts.groupAdmin)),
  };
}

/** Auswahl umschalten (neues Set, Reihenfolge egal). */
export function toggleId(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

/** Text zum Kopieren: eine Nachricht = nur ihr Text, mehrere = chronologisch „Name: Text“ je Zeile (Nachrichten ohne Text entfallen). */
export function copyPayload(messages: readonly ChatMessage[], selected: ReadonlySet<string>, nameOf: (m: ChatMessage) => string): string {
  const chosen = messages.filter((m) => selected.has(m.id) && m.text);
  if (chosen.length === 1) return chosen[0]!.text;
  return chosen.map((m) => `${nameOf(m)}: ${m.text}`).join("\n");
}

/** Name im Zitat: „Du“ für eigene Nachrichten. */
export const quoteName = (q: Pick<ChatReplyQuote, "from" | "senderName">) => (q.from === "me" ? "Du" : q.senderName || "Unbekannt");

/** Textzeile im Zitat: gelöscht, sonst Text, sonst Hinweis auf den Anhang. */
export function quoteBody(q: Pick<ChatReplyQuote, "deleted" | "text" | "hasAttachment">): string {
  if (q.deleted) return "Nachricht gelöscht";
  if (q.text) return q.text;
  return q.hasAttachment ? "📎 Anhang" : "";
}

/** Zitat zu einer Nachricht, auf die gerade geantwortet wird (Vorschau im Eingabefeld). */
export function quoteOf(m: ChatMessage, name: string): ChatReplyQuote {
  const hasAttachment = !!m.image || !!m.attachments?.length;
  return { id: m.id, from: m.from, senderName: name, text: (m.text ?? "").slice(0, 140), hasAttachment, deleted: !!m.deleted };
}

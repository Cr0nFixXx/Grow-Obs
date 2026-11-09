import type { ForumThreadBrief } from "@/services/interfaces";

export type ForumSort = "hot" | "top" | "new";

const HOUR = 3_600_000;

/**
 * Sortiert Forum-Threads (B-90). Die Serverliste kommt neueste zuerst; `createdAt` ist die Quelle der Wahrheit,
 * ohne Zeitstempel (Demo-Daten) gilt die Listenreihenfolge als Alter (vorne = neu).
 * - Neu: jüngster zuerst.
 * - Top: meiste Stimmen (gesamt), bei Gleichstand mehr Kommentare, dann neuer.
 * - Heiß: Aktivität mit Zeitabfall – Stimmen und vor allem Kommentare zählen, ältere Threads sinken.
 */
export function sortThreads(threads: readonly ForumThreadBrief[], mode: ForumSort, now = Date.now()): ForumThreadBrief[] {
  const rows = threads.map((t, index) => {
    const time = t.createdAt ? Date.parse(t.createdAt) : NaN;
    // Demo-Daten ohne Zeitstempel: pro Listenplatz 6 Stunden älter.
    const created = Number.isFinite(time) ? time : now - index * 6 * HOUR;
    return { t, created };
  });
  const hot = (r: { t: ForumThreadBrief; created: number }) => {
    const hours = Math.max(0, (now - r.created) / HOUR);
    return (Math.max(r.t.votes, 0) * 2 + r.t.comments * 3 + 1) / Math.pow(hours + 2, 1.5);
  };
  const byNew = (a: { created: number }, b: { created: number }) => b.created - a.created;
  const cmp = {
    new: byNew,
    top: (a: (typeof rows)[number], b: (typeof rows)[number]) => b.t.votes - a.t.votes || b.t.comments - a.t.comments || byNew(a, b),
    hot: (a: (typeof rows)[number], b: (typeof rows)[number]) => hot(b) - hot(a) || byNew(a, b),
  }[mode];
  return [...rows].sort(cmp).map((r) => r.t);
}

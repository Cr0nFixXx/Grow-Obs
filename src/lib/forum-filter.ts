import type { ForumComment, ForumThreadBrief } from "@/services/interfaces";

export type ForumRange = "all" | "today" | "week" | "month";

export interface ForumFilters {
  range: ForumRange;
  /** Nur eigene Threads. */
  mine: boolean;
  /** Nur Threads ohne Kommentar. */
  unanswered: boolean;
  query: string;
  /** Leer = alle Tags. */
  tag: string;
}

export const NO_FILTERS: ForumFilters = { range: "all", mine: false, unanswered: false, query: "", tag: "" };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Kleinschreibung ohne Akzente („Düngung“ findet „dungung“ und umgekehrt). */
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Erstellzeit in ms; ohne Zeitstempel (Demo-Daten) gilt wie bei der Sortierung: je Listenplatz 6 h älter. */
function createdMs(t: ForumThreadBrief, index: number, now: number): number {
  const time = t.createdAt ? Date.parse(t.createdAt) : NaN;
  return Number.isFinite(time) ? time : now - index * 6 * HOUR;
}

/** Beginn des heutigen Tages in der Zeitzone des Geräts. */
function startOfToday(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export const activeFilterCount = (f: ForumFilters) =>
  (f.range !== "all" ? 1 : 0) + (f.mine ? 1 : 0) + (f.unanswered ? 1 : 0) + (f.query.trim() ? 1 : 0) + (f.tag ? 1 : 0);

/** Wendet die Forum-Filter an (B-93). Alle Bedingungen gelten gleichzeitig (UND). */
export function filterThreads(threads: readonly ForumThreadBrief[], f: ForumFilters, now = Date.now()): ForumThreadBrief[] {
  const since = f.range === "today" ? startOfToday(now) : f.range === "week" ? now - 7 * DAY : f.range === "month" ? now - 30 * DAY : -Infinity;
  const needle = fold(f.query.trim());
  return threads.filter((t, index) => {
    if (createdMs(t, index, now) < since) return false;
    if (f.mine && !t.mine) return false;
    if (f.unanswered && t.comments > 0) return false;
    if (f.tag && t.tag !== f.tag) return false;
    if (needle && !fold(`${t.title} ${t.excerpt} ${t.author} ${t.sub} ${t.tag}`).includes(needle)) return false;
    return true;
  });
}

/** Alle vorkommenden Tags, alphabetisch. */
export const threadTags = (threads: readonly ForumThreadBrief[]): string[] =>
  [...new Set(threads.map((t) => t.tag).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"));

export type CommentSort = "oldest" | "new" | "top";

/**
 * Sortiert Kommentare (und rekursiv ihre Antworten), B-93. „Älteste“ = Reihenfolge des Servers (chronologisch),
 * „Neu“ = jüngster zuerst, „Top“ = meiste Stimmen, bei Gleichstand der jüngere zuerst. Ohne `createdAt` zählt die Position.
 */
export function sortComments(list: readonly ForumComment[], mode: CommentSort): ForumComment[] {
  const withIndex = list.map((c, index) => ({ c: { ...c, replies: c.replies ? sortComments(c.replies, mode) : c.replies }, index }));
  const time = (r: { c: ForumComment; index: number }) => {
    const ms = r.c.createdAt ? Date.parse(r.c.createdAt) : NaN;
    return Number.isFinite(ms) ? ms : r.index;
  };
  if (mode === "new") withIndex.sort((a, b) => time(b) - time(a));
  else if (mode === "top") withIndex.sort((a, b) => b.c.votes - a.c.votes || time(b) - time(a));
  return withIndex.map((r) => r.c);
}

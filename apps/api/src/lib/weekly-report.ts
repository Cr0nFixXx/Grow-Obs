import { and, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { growLogs, grows, users } from "../db/schema.ts";
import { createNotification } from "./notify.ts";
import { todayIso } from "./grow-state.ts";

export const REPORT_TIME_ZONE = "Europe/Berlin";
const DAY_MS = 86_400_000;

/** Kalenderdatum (Jahr, Monat, Tag) eines Zeitpunkts in der Berichts-Zeitzone. */
function localDate(now: Date, timeZone = REPORT_TIME_ZONE): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** ISO-8601-Woche des Zeitpunkts in der Berichts-Zeitzone, z. B. "2026-W43" (Woche beginnt Montag, Woche 1 enthält den ersten Donnerstag). */
export function isoWeekKey(now: Date, timeZone = REPORT_TIME_ZONE): string {
  const { y, m, d } = localDate(now, timeZone);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = date.getUTCDay() || 7; // Montag = 1 … Sonntag = 7
  date.setUTCDate(date.getUTCDate() + 4 - weekday); // Donnerstag derselben Woche
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Tage seit dem Start (Berichts-Zeitzone), nie negativ. */
export function daysSince(startDate: string, now: Date, timeZone = REPORT_TIME_ZONE): number {
  const { y, m, d } = localDate(now, timeZone);
  const [sy, sm, sd] = startDate.split("-").map(Number);
  if (!sy || !sm || !sd) return 0;
  return Math.max(0, Math.round((Date.UTC(y, m - 1, d) - Date.UTC(sy, sm - 1, sd)) / DAY_MS));
}

const MAX_GROWS_IN_TEXT = 4;

export function reportBody(items: { name: string; day: number; totalDays: number; phase: string; entries: number }[]): string {
  const lines = items.slice(0, MAX_GROWS_IN_TEXT).map((g) => {
    const entries = g.entries === 1 ? "1 Eintrag" : `${g.entries} Einträge`;
    return `${g.name}: Tag ${g.day} von ${g.totalDays}, ${g.phase}, ${entries} in 7 Tagen`;
  });
  if (items.length > MAX_GROWS_IN_TEXT) lines.push(`… und ${items.length - MAX_GROWS_IN_TEXT} weitere`);
  return lines.join("\n");
}

/**
 * Wochenreport (B-71): sendet allen Konten mit eingeschaltetem Wochenreport einmal je ISO-Woche eine Meldung
 * über ihre Grows (Tag, Phase, Einträge der letzten 7 Tage). Konten ohne Grow bekommen nichts.
 * Idempotent: Die Woche wird je Konto atomar reserviert, bevor gesendet wird (parallele Aufrufe senden nicht doppelt).
 */
export async function runWeeklyReports(now = new Date()): Promise<{ week: string; candidates: number; sent: number }> {
  const week = isoWeekKey(now);
  const candidates = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.weeklyReport, true), or(isNull(users.weeklyReportWeek), ne(users.weeklyReportWeek, week))));
  let sent = 0;
  // Die letzten 7 Kalendertage (heute und die 6 davor, Europe/Berlin) nach dem Datum des Eintrags (`logged_on`, B-86b),
  // nicht nach dem Anlegezeitpunkt: ein rückwirkend nachgetragener Eintrag zählt für den Tag, an dem er passiert ist.
  const since = todayIso(new Date(now.getTime() - 6 * DAY_MS), REPORT_TIME_ZONE);
  for (const { id } of candidates) {
    const claimed = await db.update(users).set({ weeklyReportWeek: week })
      .where(and(eq(users.id, id), eq(users.weeklyReport, true), or(isNull(users.weeklyReportWeek), ne(users.weeklyReportWeek, week))))
      .returning({ id: users.id });
    if (claimed.length === 0) continue;
    const rows = await db.select().from(grows).where(and(eq(grows.userId, id), eq(grows.status, "active"), isNull(grows.archivedAt))).orderBy(grows.createdAt);
    if (rows.length === 0) continue;
    const counts = await db.select({ growId: growLogs.growId, n: sql<number>`count(*)::int` }).from(growLogs)
      .where(and(inArray(growLogs.growId, rows.map((r) => r.id)), gte(growLogs.loggedOn, since))).groupBy(growLogs.growId);
    const byGrow = new Map(counts.map((c) => [c.growId, c.n]));
    const items = rows.map((r) => ({ name: r.name, day: daysSince(r.startDate, now), totalDays: r.totalDays, phase: r.phase, entries: byGrow.get(r.id) ?? 0 }));
    try {
      await createNotification(id, { type: "grow", title: "Dein Wochenreport", body: reportBody(items), url: "/grows" });
      sent += 1;
    } catch (error) {
      console.error(JSON.stringify({ event: "weekly_report_failed", type: error instanceof Error ? error.name : "unknown" }));
    }
  }
  return { week, candidates: candidates.length, sent };
}

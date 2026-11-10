import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { sweepOrphanMedia } from "../lib/media-cleanup.ts";
import { expireLiveStatuses } from "../lib/status.ts";
import { runGrowReminders } from "../lib/grow-reminders.ts";
import { runWeeklyReports } from "../lib/weekly-report.ts";

export const cronApi = new Hono();

function authorized(header: string | undefined, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Wochenreport auslösen (B-71). Aufruf z. B. durch Vercel Cron (GET, `Authorization: Bearer $CRON_SECRET`) oder einen externen Cron.
 * Ohne `CRON_SECRET` existiert der Endpunkt nicht (404). Mehrfaches Aufrufen in derselben Woche sendet nichts doppelt.
 */
cronApi.get("/weekly-report", async (c) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return c.json({ error: "Nicht gefunden" }, 404);
  if (!authorized(c.req.header("authorization"), secret)) return c.json({ error: "Nicht erlaubt" }, 401);
  return c.json(await runWeeklyReports());
});

/** Verwaiste Bilder (älter als 24 h, nirgends mehr verwendet) aus Datenbank und Bucket entfernen (B-78). Gleiche Absicherung wie der Wochenreport. */
cronApi.get("/media-cleanup", async (c) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return c.json({ error: "Nicht gefunden" }, 404);
  if (!authorized(c.req.header("authorization"), secret)) return c.json({ error: "Nicht erlaubt" }, 401);
  const live = await expireLiveStatuses();
  return c.json({ ...(await sweepOrphanMedia()), liveExpired: live.expired });
});

/** Erinnerungen bei fehlenden Messwerten/Logs (B-88), einmal täglich. Gleiche Absicherung; je Lücke wird nur einmal erinnert. */
cronApi.get("/grow-reminders", async (c) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return c.json({ error: "Nicht gefunden" }, 404);
  if (!authorized(c.req.header("authorization"), secret)) return c.json({ error: "Nicht erlaubt" }, 401);
  return c.json(await runGrowReminders());
});

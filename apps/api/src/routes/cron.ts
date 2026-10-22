import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
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

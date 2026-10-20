import { Hono } from "hono";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import { pushPrefs, pushSubscriptions } from "../db/schema.ts";
import { requireAuth, type AuthEnv } from "../middleware/auth.ts";
import { rateLimit, userKey } from "../middleware/rate-limit.ts";
import { deviceLabel } from "../lib/session.ts";
import { formatClock, isAllowedEndpoint, isValidTimezone, parseClock } from "../lib/push-core.ts";
import { getPrefs, pushConfigured, sendPushToUser, vapidPublicKey } from "../lib/push.ts";

/** Web-Push (B-63): Konfiguration, Abos je Gerät, Einstellungen, Test-Push. Gesperrt, wenn das Feature `push` aus ist. */
export const pushApi = new Hono<AuthEnv>();
pushApi.use("*", requireAuth);

export const MAX_PUSH_DEVICES = 5;

pushApi.get("/config", (c) => c.json({ configured: pushConfigured(), publicKey: vapidPublicKey() }));

async function state(userId: string, sessionId: string) {
  const prefs = await getPrefs(userId);
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).orderBy(asc(pushSubscriptions.createdAt));
  return {
    configured: pushConfigured(),
    prefs: { messages: prefs.messages, community: prefs.community, grows: prefs.grows, other: prefs.other, showPreview: prefs.showPreview, quietEnabled: prefs.quietEnabled, quietStart: formatClock(prefs.quietStart), quietEnd: formatClock(prefs.quietEnd), timezone: prefs.timezone },
    devices: subs.map((s) => ({ id: s.id, device: deviceLabel(s.userAgent), createdAt: s.createdAt.toISOString(), current: s.sessionId === sessionId })),
  };
}

pushApi.get("/", async (c) => c.json(await state(c.get("userId"), c.get("sessionId"))));

const clock = z.string().refine((v) => parseClock(v) !== null, "HH:MM erwartet");
const prefsSchema = z.object({
  messages: z.boolean(), community: z.boolean(), grows: z.boolean(), other: z.boolean(), showPreview: z.boolean(),
  quietEnabled: z.boolean(), quietStart: clock, quietEnd: clock,
  timezone: z.string().max(64).refine(isValidTimezone, "Unbekannte Zeitzone"),
}).partial();

pushApi.put("/prefs", async (c) => {
  const body = prefsSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültige Daten" }, 400);
  const userId = c.get("userId"), d = body.data;
  const set = {
    ...(d.messages !== undefined && { messages: d.messages }), ...(d.community !== undefined && { community: d.community }),
    ...(d.grows !== undefined && { grows: d.grows }), ...(d.other !== undefined && { other: d.other }),
    ...(d.showPreview !== undefined && { showPreview: d.showPreview }), ...(d.quietEnabled !== undefined && { quietEnabled: d.quietEnabled }),
    ...(d.quietStart !== undefined && { quietStart: parseClock(d.quietStart)! }), ...(d.quietEnd !== undefined && { quietEnd: parseClock(d.quietEnd)! }),
    ...(d.timezone !== undefined && { timezone: d.timezone }), updatedAt: new Date(),
  };
  await db.insert(pushPrefs).values({ userId, ...set }).onConflictDoUpdate({ target: pushPrefs.userId, set });
  return c.json(await state(userId, c.get("sessionId")));
});

const subscribeSchema = z.object({
  endpoint: z.string().url().refine(isAllowedEndpoint, "Unbekannter Push-Dienst"),
  keys: z.object({ p256dh: z.string().min(40).max(200).regex(/^[A-Za-z0-9_-]+$/), auth: z.string().min(10).max(100).regex(/^[A-Za-z0-9_-]+$/) }),
});

pushApi.post("/subscribe", rateLimit({ name: "push-subscribe", limit: 30, windowMs: 10 * 60_000, keys: userKey }), async (c) => {
  if (!pushConfigured()) return c.json({ error: "Push ist auf diesem Server nicht eingerichtet." }, 503);
  const body = subscribeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültige Daten" }, 400);
  const userId = c.get("userId"), sessionId = c.get("sessionId");
  const row = { userId, sessionId, endpoint: body.data.endpoint, p256dh: body.data.keys.p256dh, auth: body.data.keys.auth, userAgent: (c.req.header("user-agent") ?? "").slice(0, 300) || null, failureCount: 0 };
  // Ein Endpunkt gehört genau einem Konto/einer Sitzung (anderes Konto auf demselben Browser → umhängen).
  await db.insert(pushSubscriptions).values(row).onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: row });
  // Gerätelimit (wie bei Sitzungen): die ältesten Abos fallen weg.
  const mine = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).orderBy(asc(pushSubscriptions.createdAt));
  for (const surplus of mine.slice(0, Math.max(0, mine.length - MAX_PUSH_DEVICES))) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, surplus.id));
  return c.json(await state(userId, sessionId), 201);
});

pushApi.post("/unsubscribe", async (c) => {
  const body = z.object({ endpoint: z.string().max(2048) }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültige Daten" }, 400);
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, c.get("userId")), eq(pushSubscriptions.endpoint, body.data.endpoint)));
  return c.json(await state(c.get("userId"), c.get("sessionId")));
});

pushApi.delete("/devices/:id", async (c) => {
  const id = z.string().uuid().safeParse(c.req.param("id"));
  if (!id.success) return c.json({ error: "Ungültige Daten" }, 400);
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.id, id.data), eq(pushSubscriptions.userId, c.get("userId"))));
  return c.json(await state(c.get("userId"), c.get("sessionId")));
});

pushApi.post("/test", rateLimit({ name: "push-test", limit: 6, windowMs: 60_000, keys: userKey }), async (c) => {
  const result = await sendPushToUser(c.get("userId"), { category: "other", title: "Test-Benachrichtigung", body: "Push funktioniert auf diesem Gerät.", url: "/notifications", tag: "go-test" }, { force: true, preview: true });
  if (result.skipped === "not-configured") return c.json({ error: "Push ist auf diesem Server nicht eingerichtet." }, 503);
  if (result.skipped === "no-subscriptions") return c.json({ error: "Kein Gerät angemeldet." }, 409);
  return c.json({ sent: result.sent });
});

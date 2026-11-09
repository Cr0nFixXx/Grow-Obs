import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import { reports } from "../db/schema.ts";
import { requireAuth, type AuthEnv } from "../middleware/auth.ts";
import { rateLimit, userKey } from "../middleware/rate-limit.ts";
import { uuid } from "../lib/validation.ts";
import { createNotification } from "../lib/notify.ts";
import { loadReportQueue, pageParams } from "../lib/report-queue.ts";
import { assertMayHideOf, loadGlobalTarget, logModeration, requirePlatformModerator, setGlobalHidden, type GlobalTarget } from "../lib/platform-moderation.ts";

/**
 * Plattform-Moderation (B-89): Melden für alle Angemeldeten, Warteschlange/Ausblenden/Entscheiden für die Plattformrollen
 * Moderator, Admin und Betreiber. Gilt für den globalen Feed (Beiträge ohne Community) und das Forum.
 */
export const platformModerationApi = new Hono<AuthEnv>();
platformModerationApi.use("*", requireAuth);

const KINDS = ["post", "comment", "thread", "forum_comment"] as const;
const NOUN: Record<GlobalTarget["kind"], string> = { post: "Beitrag", comment: "Kommentar", thread: "Thread", forum_comment: "Kommentar" };

async function notifyHidden(target: GlobalTarget, actorId: string) {
  if (target.authorId === actorId) return;
  await createNotification(target.authorId, {
    type: "system",
    title: `Dein ${NOUN[target.kind]} wurde ausgeblendet`,
    body: `Ein Moderator hat ihn ausgeblendet: „${target.text.slice(0, 80)}${target.text.length > 80 ? "…" : ""}“`,
  }).catch(() => undefined);
}

const reportSchema = z.object({
  kind: z.enum(KINDS),
  targetId: z.string().uuid(),
  reason: z.enum(["spam", "harassment", "illegal", "offtopic", "other"]),
  details: z.string().trim().max(500).default(""),
});
platformModerationApi.post("/reports", rateLimit({ name: "report", limit: 20, windowMs: 60 * 60 * 1000, keys: userKey }), async (c) => {
  const userId = c.get("userId");
  const body = reportSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültige Meldung" }, 400);
  const target = await loadGlobalTarget(body.data.kind, body.data.targetId);
  if (target.hidden) throw new HTTPException(404, { message: "Inhalt nicht gefunden" });
  if (target.authorId === userId) return c.json({ error: "Eigene Inhalte kannst du nicht melden" }, 400);
  const inserted = await db.insert(reports).values({
    communityId: null, reporterId: userId, kind: target.kind, targetId: target.id, reason: body.data.reason, details: body.data.details,
  }).onConflictDoNothing().returning({ id: reports.id });
  return c.json({ ok: true, duplicate: inserted.length === 0 }, inserted.length ? 201 : 200);
});

/** Warteschlange (nur Plattform-Moderation), seitenweise: `{ items, hasMore }`. */
platformModerationApi.get("/reports", requirePlatformModerator, async (c) => {
  const { offset, status } = pageParams(c);
  return c.json(await loadReportQueue({ global: true }, status, offset));
});

const resolveSchema = z.object({ kind: z.enum(KINDS), targetId: z.string().uuid(), action: z.enum(["hide", "dismiss"]) });
platformModerationApi.post("/reports/resolve", requirePlatformModerator, async (c) => {
  const actorId = c.get("userId");
  const body = resolveSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültige Daten" }, 400);
  const { kind, targetId, action } = body.data;
  const global = and(eq(reports.kind, kind), eq(reports.targetId, targetId), eq(reports.status, "open"), isNull(reports.communityId));
  const [any] = await db.select({ id: reports.id }).from(reports).where(global).limit(1);
  if (!any) throw new HTTPException(404, { message: "Keine offene Meldung" });

  let target: GlobalTarget | null = null;
  if (action === "hide") {
    target = await loadGlobalTarget(kind, targetId).catch(() => null);
    if (target) await assertMayHideOf(c.get("role"), target.authorId);
  }
  const resolved = await db.transaction(async (tx) => {
    if (target && !target.hidden) await setGlobalHidden(target, true, actorId, tx);
    return tx.update(reports).set({ status: action === "hide" ? "hidden" : "dismissed", resolvedBy: actorId, resolvedAt: new Date() }).where(global).returning({ id: reports.id });
  });
  if (target && !target.hidden) await notifyHidden(target, actorId);
  await logModeration({ actorId, action: action === "hide" ? "report_hide" : "report_dismiss", targetUserId: target?.authorId, targetKind: kind, targetId, details: { scope: "global", reports: resolved.length } });
  return c.json({ ok: true, resolved: resolved.length });
});

const hideSchema = z.object({ kind: z.enum(KINDS), targetId: z.string().uuid(), hidden: z.boolean() });
/** Ausblenden/Einblenden ohne vorherige Meldung (Plattform-Moderation). */
platformModerationApi.post("/hide", requirePlatformModerator, async (c) => {
  const actorId = c.get("userId");
  const body = hideSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültige Daten" }, 400);
  const target = await loadGlobalTarget(body.data.kind, uuid(body.data.targetId));
  if (body.data.hidden) await assertMayHideOf(c.get("role"), target.authorId);
  if (target.hidden !== body.data.hidden) {
    await setGlobalHidden(target, body.data.hidden, actorId);
    if (body.data.hidden) await notifyHidden(target, actorId);
    await logModeration({ actorId, action: body.data.hidden ? "hide" : "unhide", targetUserId: target.authorId, targetKind: target.kind, targetId: target.id, details: { scope: "global" } });
  }
  return c.json({ ok: true, hidden: body.data.hidden });
});

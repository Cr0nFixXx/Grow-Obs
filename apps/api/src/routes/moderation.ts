import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import { itemComments, posts, reports } from "../db/schema.ts";
import type { AuthEnv } from "../middleware/auth.ts";
import { rateLimit, userKey } from "../middleware/rate-limit.ts";
import { uuid } from "../lib/validation.ts";
import { loadReportQueue, pageParams } from "../lib/report-queue.ts";
import { logModeration } from "../lib/platform-moderation.ts";
import { createNotification } from "../lib/notify.ts";
import { communityRole, isModerator, publishCommunityFeed, type CommunityRole } from "../lib/moderation.ts";

/**
 * Community-Moderation (B-61). Wird in `communities.ts` unter `/communities` eingehängt (Auth dort).
 * Rechte: Moderatoren und Admins der Community blenden aus/ein und entscheiden Meldungen; Inhalte von Admins
 * fasst ein Moderator nicht an. Jedes Mitglied darf melden (fremde, sichtbare Inhalte der eigenen Community).
 */
export const moderationApi = new Hono<AuthEnv>();

type Target = { kind: "post" | "comment"; id: string; authorId: string; postId: string; text: string; image: string | null; hidden: boolean };

async function requireModerator(communityId: string, userId: string): Promise<CommunityRole> {
  const role = await communityRole(communityId, userId);
  if (!isModerator(role)) throw new HTTPException(403, { message: "Keine Berechtigung" });
  return role as CommunityRole;
}

/** Lädt Beitrag/Kommentar und stellt sicher, dass er zu dieser Community gehört (sonst 404). */
async function loadTarget(communityId: string, kind: "post" | "comment", id: string): Promise<Target> {
  if (kind === "post") {
    const [p] = await db.select().from(posts).where(and(eq(posts.id, id), eq(posts.communityId, communityId))).limit(1);
    if (!p) throw new HTTPException(404, { message: "Inhalt nicht gefunden" });
    return { kind, id, authorId: p.userId, postId: p.id, text: p.text, image: p.imageUrl, hidden: !!p.hiddenAt };
  }
  const [row] = await db
    .select({ comment: itemComments, post: posts })
    .from(itemComments).innerJoin(posts, eq(posts.id, itemComments.itemId))
    .where(and(eq(itemComments.id, id), eq(itemComments.kind, "post"), eq(posts.communityId, communityId))).limit(1);
  if (!row) throw new HTTPException(404, { message: "Inhalt nicht gefunden" });
  return { kind, id, authorId: row.comment.userId, postId: row.post.id, text: row.comment.body, image: null, hidden: !!row.comment.hiddenAt };
}

/** Moderatoren dürfen Inhalte von Admins nicht ausblenden. */
async function assertMayHide(communityId: string, actorRole: CommunityRole, target: Target) {
  if (actorRole === "moderator" && (await communityRole(communityId, target.authorId)) === "admin") {
    throw new HTTPException(403, { message: "Inhalte von Admins können Moderatoren nicht ausblenden" });
  }
}

async function setHidden(communityId: string, target: Target, hidden: boolean, actorId: string) {
  const values = hidden ? { hiddenAt: new Date(), hiddenBy: actorId } : { hiddenAt: null, hiddenBy: null };
  if (target.kind === "post") await db.update(posts).set(values).where(and(eq(posts.id, target.id), eq(posts.communityId, communityId)));
  else await db.update(itemComments).set(values).where(eq(itemComments.id, target.id));
}

async function notifyHidden(target: Target, actorId: string) {
  if (target.authorId === actorId) return;
  await createNotification(target.authorId, {
    type: "system",
    title: target.kind === "post" ? "Dein Beitrag wurde ausgeblendet" : "Dein Kommentar wurde ausgeblendet",
    body: `Ein Moderator hat ihn ausgeblendet: „${target.text.slice(0, 80)}${target.text.length > 80 ? "…" : ""}“`,
  }).catch(() => undefined);
}

for (const [segment, kind, param] of [["posts", "post", "postId"], ["comments", "comment", "commentId"]] as const) {
  for (const hide of [true, false]) {
    moderationApi.post(`/:id/${segment}/:${param}/${hide ? "hide" : "unhide"}`, async (c) => {
      const communityId = uuid(c.req.param("id"));
      const targetId = uuid(c.req.param(param));
      const actorRole = await requireModerator(communityId, c.get("userId"));
      const target = await loadTarget(communityId, kind, targetId);
      if (hide) await assertMayHide(communityId, actorRole, target);
      if (target.hidden !== hide) {
        await setHidden(communityId, target, hide, c.get("userId"));
        if (hide) await notifyHidden(target, c.get("userId"));
        await logModeration({ actorId: c.get("userId"), action: hide ? "hide" : "unhide", targetUserId: target.authorId, targetKind: kind, targetId, details: { scope: "community", communityId } });
        await publishCommunityFeed(communityId, "moderation", target.postId);
      }
      return c.json({ ok: true, hidden: hide });
    });
  }
}

const reportSchema = z.object({
  kind: z.enum(["post", "comment"]),
  targetId: z.string().uuid(),
  reason: z.enum(["spam", "harassment", "illegal", "offtopic", "other"]),
  details: z.string().trim().max(500).default(""),
});
moderationApi.post("/:id/reports", rateLimit({ name: "report", limit: 20, windowMs: 60 * 60 * 1000, keys: userKey }), async (c) => {
  const communityId = uuid(c.req.param("id"));
  const userId = c.get("userId");
  const body = reportSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültige Meldung" }, 400);
  if (!await communityRole(communityId, userId)) throw new HTTPException(403, { message: "Nur Mitglieder können melden" });
  const target = await loadTarget(communityId, body.data.kind, body.data.targetId);
  if (target.hidden) throw new HTTPException(404, { message: "Inhalt nicht gefunden" });
  if (target.authorId === userId) return c.json({ error: "Eigene Inhalte kannst du nicht melden" }, 400);
  const inserted = await db.insert(reports).values({
    communityId, reporterId: userId, kind: target.kind, targetId: target.id, reason: body.data.reason, details: body.data.details,
  }).onConflictDoNothing().returning({ id: reports.id });
  return c.json({ ok: true, duplicate: inserted.length === 0 }, inserted.length ? 201 : 200);
});

/** Warteschlange gruppiert nach gemeldetem Inhalt, seitenweise (`offset`, Antwort `{items, hasMore}`). `status=open` (Standard) oder `closed`. */
moderationApi.get("/:id/reports", async (c) => {
  const communityId = uuid(c.req.param("id"));
  await requireModerator(communityId, c.get("userId"));
  const { offset, status } = pageParams(c);
  return c.json(await loadReportQueue({ communityId }, status, offset));
});

const resolveSchema = z.object({ kind: z.enum(["post", "comment"]), targetId: z.string().uuid(), action: z.enum(["hide", "dismiss"]) });
/** Entscheidet alle offenen Meldungen zu einem Inhalt: ausblenden (und erledigen) oder „kein Verstoß“. */
moderationApi.post("/:id/reports/resolve", async (c) => {
  const communityId = uuid(c.req.param("id"));
  const actorId = c.get("userId");
  const actorRole = await requireModerator(communityId, actorId);
  const body = resolveSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültige Daten" }, 400);
  const { kind, targetId, action } = body.data;
  const open = and(eq(reports.communityId, communityId), eq(reports.kind, kind), eq(reports.targetId, targetId), eq(reports.status, "open"));
  const [any] = await db.select({ id: reports.id }).from(reports).where(open).limit(1);
  if (!any) throw new HTTPException(404, { message: "Keine offene Meldung" });

  let target: Target | null = null;
  if (action === "hide") {
    target = await loadTarget(communityId, kind, targetId).catch(() => null);
    if (target) await assertMayHide(communityId, actorRole, target);
  }
  const resolved = await db.transaction(async (tx) => {
    if (target && !target.hidden) {
      const values = { hiddenAt: new Date(), hiddenBy: actorId };
      if (target.kind === "post") await tx.update(posts).set(values).where(eq(posts.id, target.id));
      else await tx.update(itemComments).set(values).where(eq(itemComments.id, target.id));
    }
    return tx.update(reports).set({ status: action === "hide" ? "hidden" : "dismissed", resolvedBy: actorId, resolvedAt: new Date() }).where(open).returning({ id: reports.id });
  });
  if (target && !target.hidden) await notifyHidden(target, actorId);
  await logModeration({ actorId, action: action === "hide" ? "report_hide" : "report_dismiss", targetUserId: target?.authorId, targetKind: kind, targetId, details: { scope: "community", communityId, reports: resolved.length } });
  await publishCommunityFeed(communityId, "moderation", target?.postId);
  return c.json({ ok: true, resolved: resolved.length });
});


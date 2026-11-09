import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { createMiddleware } from "hono/factory";
import { db } from "../db/client.ts";
import { comments, itemComments, moderationLog, posts, threads, users } from "../db/schema.ts";
import type { AuthEnv } from "../middleware/auth.ts";

/**
 * Plattform-Moderation (B-89): globaler Feed (Beiträge ohne Community) und Forum. Moderiert wird mit der Plattformrolle
 * (`users.role`): Moderator, Admin und Betreiber (platform_admin) entscheiden Meldungen und blenden aus/ein.
 */
export type PlatformRole = typeof users.$inferSelect.role;
export type GlobalKind = "post" | "comment" | "thread" | "forum_comment";

const RANK: Record<PlatformRole, number> = { member: 0, moderator: 1, admin: 2, platform_admin: 3 };
export const isPlatformModerator = (role: PlatformRole | undefined | null): boolean => !!role && RANK[role] >= RANK.moderator;

export const requirePlatformModerator = createMiddleware<AuthEnv>(async (c, next) => {
  if (!isPlatformModerator(c.get("role"))) return c.json({ error: "Keine Berechtigung" }, 403);
  await next();
});

/** Wer ausblendet, muss einen höheren Rang haben als der Autor – Betreiber dürfen alles. */
export async function assertMayHideOf(actorRole: PlatformRole, authorId: string): Promise<void> {
  if (actorRole === "platform_admin") return;
  const [author] = await db.select({ role: users.role }).from(users).where(eq(users.id, authorId)).limit(1);
  if (author && RANK[author.role] >= RANK[actorRole]) {
    throw new HTTPException(403, { message: "Inhalte von gleich- oder höherrangigen Rollen können nicht ausgeblendet werden" });
  }
}

export interface GlobalTarget { kind: GlobalKind; id: string; authorId: string; text: string; hidden: boolean }

/** Lädt Beitrag/Kommentar/Thread, sofern er global ist (nicht in einer Community); sonst 404. */
export async function loadGlobalTarget(kind: GlobalKind, id: string): Promise<GlobalTarget> {
  const notFound = () => new HTTPException(404, { message: "Inhalt nicht gefunden" });
  if (kind === "post") {
    const [p] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
    if (!p || p.communityId) throw notFound();
    return { kind, id, authorId: p.userId, text: p.text, hidden: !!p.hiddenAt };
  }
  if (kind === "comment") {
    const [row] = await db.select({ c: itemComments, communityId: posts.communityId }).from(itemComments)
      .innerJoin(posts, eq(posts.id, itemComments.itemId)).where(and(eq(itemComments.id, id), eq(itemComments.kind, "post"))).limit(1);
    if (!row || row.communityId) throw notFound();
    return { kind, id, authorId: row.c.userId, text: row.c.body, hidden: !!row.c.hiddenAt };
  }
  if (kind === "thread") {
    const [t] = await db.select().from(threads).where(eq(threads.id, id)).limit(1);
    if (!t) throw notFound();
    return { kind, id, authorId: t.userId, text: t.title, hidden: !!t.hiddenAt };
  }
  const [cm] = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
  if (!cm) throw notFound();
  return { kind, id, authorId: cm.userId, text: cm.body, hidden: !!cm.hiddenAt };
}

export async function setGlobalHidden(target: GlobalTarget, hidden: boolean, actorId: string, tx: Pick<typeof db, "update"> = db): Promise<void> {
  const values = hidden ? { hiddenAt: new Date(), hiddenBy: actorId } : { hiddenAt: null, hiddenBy: null };
  if (target.kind === "post") await tx.update(posts).set(values).where(eq(posts.id, target.id));
  else if (target.kind === "comment") await tx.update(itemComments).set(values).where(eq(itemComments.id, target.id));
  else if (target.kind === "thread") await tx.update(threads).set(values).where(eq(threads.id, target.id));
  else await tx.update(comments).set(values).where(eq(comments.id, target.id));
}

export interface LogEntry {
  actorId: string; action: string; targetUserId?: string; targetName?: string; targetKind?: string; targetId?: string; reason?: string | null; details?: Record<string, unknown>;
}

/** Schreibt eine Moderationsaktion ins Protokoll (Namen als Momentaufnahme). Ein Fehler hier bricht die Aktion nie ab. */
export async function logModeration(entry: LogEntry): Promise<void> {
  try {
    const ids = [entry.actorId, ...(entry.targetUserId ? [entry.targetUserId] : [])];
    const rows = await Promise.all(ids.map((id) => db.select({ name: users.name }).from(users).where(eq(users.id, id)).limit(1)));
    await db.insert(moderationLog).values({
      actorId: entry.actorId, actorName: rows[0]?.[0]?.name ?? "?", action: entry.action,
      targetUserId: entry.targetUserId ?? null, targetName: entry.targetName ?? (entry.targetUserId ? rows[1]?.[0]?.name ?? null : null),
      targetKind: entry.targetKind ?? null, targetId: entry.targetId ?? null, reason: entry.reason?.trim() || null, details: entry.details ?? null,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: "moderation_log_failed", code: (error as { cause?: { code?: string } }).cause?.code ?? "unknown" }));
  }
}

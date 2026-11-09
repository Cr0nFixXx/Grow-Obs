import { and, asc, desc, eq, inArray, isNull, max, min, ne, type SQL } from "drizzle-orm";
import { db } from "../db/client.ts";
import { comments, itemComments, posts, reports, threads, users } from "../db/schema.ts";
import { ago } from "./time.ts";

export type QueueScope = { communityId: string } | { global: true };
export const QUEUE_PAGE = 20;

type Kind = typeof reports.$inferSelect["kind"];
interface Preview { text: string; image: string | null; author: string; handle: string; hidden: boolean; title?: string }

/**
 * Warteschlange der Meldungen, gruppiert nach gemeldetem Inhalt und seitenweise (B-89, vorher hart auf 100/50 begrenzt).
 * `status=open`: älteste zuerst; `closed`: zuletzt entschieden zuerst.
 */
export async function loadReportQueue(scope: QueueScope, status: "open" | "closed", offset: number, limit = QUEUE_PAGE) {
  const open = status === "open";
  const scopeWhere: SQL = "communityId" in scope ? eq(reports.communityId, scope.communityId) : isNull(reports.communityId);
  const where = and(scopeWhere, open ? eq(reports.status, "open") : ne(reports.status, "open"));

  const groupRows = await db
    .select({ kind: reports.kind, targetId: reports.targetId, status: reports.status, first: min(reports.createdAt), resolvedAt: max(reports.resolvedAt) })
    .from(reports).where(where).groupBy(reports.kind, reports.targetId, reports.status)
    .orderBy(open ? asc(min(reports.createdAt)) : desc(max(reports.resolvedAt)), asc(reports.targetId))
    .limit(limit + 1).offset(offset);
  const hasMore = groupRows.length > limit;
  const list = groupRows.slice(0, limit);
  if (list.length === 0) return { items: [], hasMore: false };

  const items = await db.select({ r: reports, reporter: users.name }).from(reports).innerJoin(users, eq(users.id, reports.reporterId))
    .where(and(where, inArray(reports.targetId, list.map((g) => g.targetId)))).orderBy(asc(reports.createdAt));

  const ids = (kind: Kind) => list.filter((g) => g.kind === kind).map((g) => g.targetId);
  const previews = new Map<string, Preview>();
  const key = (kind: Kind, id: string) => `${kind}:${id}`;
  if (ids("post").length) {
    for (const x of await db.select({ p: posts, name: users.name, handle: users.handle }).from(posts).innerJoin(users, eq(users.id, posts.userId)).where(inArray(posts.id, ids("post")))) {
      previews.set(key("post", x.p.id), { text: x.p.text, image: x.p.imageUrl, author: x.name, handle: x.handle, hidden: !!x.p.hiddenAt });
    }
  }
  if (ids("comment").length) {
    for (const x of await db.select({ c: itemComments, name: users.name, handle: users.handle }).from(itemComments).innerJoin(users, eq(users.id, itemComments.userId)).where(inArray(itemComments.id, ids("comment")))) {
      previews.set(key("comment", x.c.id), { text: x.c.body, image: null, author: x.name, handle: x.handle, hidden: !!x.c.hiddenAt });
    }
  }
  if (ids("thread").length) {
    for (const x of await db.select({ t: threads, name: users.name, handle: users.handle }).from(threads).innerJoin(users, eq(users.id, threads.userId)).where(inArray(threads.id, ids("thread")))) {
      previews.set(key("thread", x.t.id), { title: x.t.title, text: x.t.body, image: null, author: x.name, handle: x.handle, hidden: !!x.t.hiddenAt });
    }
  }
  if (ids("forum_comment").length) {
    for (const x of await db.select({ c: comments, name: users.name, handle: users.handle }).from(comments).innerJoin(users, eq(users.id, comments.userId)).where(inArray(comments.id, ids("forum_comment")))) {
      previews.set(key("forum_comment", x.c.id), { text: x.c.body, image: null, author: x.name, handle: x.handle, hidden: !!x.c.hiddenAt });
    }
  }
  const resolverIds = [...new Set(items.map((i) => i.r.resolvedBy).filter((x): x is string => !!x))];
  const resolvers = resolverIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, resolverIds)) : [];

  return {
    hasMore,
    items: list.map((g) => {
      const mine = items.filter((i) => i.r.kind === g.kind && i.r.targetId === g.targetId && i.r.status === g.status);
      const first = mine[0]?.r;
      return {
        kind: g.kind, targetId: g.targetId, status: g.status, count: mine.length, preview: previews.get(key(g.kind, g.targetId)) ?? null,
        reports: mine.map(({ r, reporter }) => ({ id: r.id, reporter, reason: r.reason, details: r.details, ago: ago(r.createdAt) })),
        ...(g.status !== "open" ? { resolvedBy: resolvers.find((x) => x.id === first?.resolvedBy)?.name ?? null, resolvedAgo: g.resolvedAt ? ago(g.resolvedAt) : null } : {}),
      };
    }),
  };
}

export function pageParams(c: { req: { query: (name: string) => string | undefined } }): { offset: number; status: "open" | "closed" } {
  const offset = Math.max(0, Math.min(100_000, Number.parseInt(c.req.query("offset") ?? "0", 10) || 0));
  return { offset, status: c.req.query("status") === "closed" ? "closed" : "open" };
}

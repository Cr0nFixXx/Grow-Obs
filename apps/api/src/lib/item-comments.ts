import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import { itemComments, users } from "../db/schema.ts";
import { ago } from "./time.ts";

export type ItemKind = "post" | "hall";
export const itemCommentSchema = z.object({ text: z.string().trim().min(1).max(2000) }).strict();

/**
 * Kommentare eines Ziels. Ausgeblendete (B-61) sehen nur Moderatoren (`includeHidden`), dann mit `hidden: true`.
 * `mine` markiert eigene Kommentare (z. B. um „Melden“ auszublenden).
 */
export async function listItemComments(kind: ItemKind, itemId: string, opts: { viewerId?: string; includeHidden?: boolean } = {}) {
  const rows = await db
    .select({ id: itemComments.id, body: itemComments.body, createdAt: itemComments.createdAt, name: users.name, avatar: users.avatarUrl, userId: itemComments.userId, hiddenAt: itemComments.hiddenAt })
    .from(itemComments)
    .innerJoin(users, eq(itemComments.userId, users.id))
    .where(and(eq(itemComments.kind, kind), eq(itemComments.itemId, itemId), opts.includeHidden ? undefined : isNull(itemComments.hiddenAt)))
    .orderBy(asc(itemComments.createdAt))
    .limit(200);
  return rows.map((r) => ({
    id: r.id, author: r.name, avatar: r.avatar ?? "", body: r.body, ago: ago(r.createdAt),
    mine: !!opts.viewerId && r.userId === opts.viewerId, ...(r.hiddenAt ? { hidden: true } : {}),
  }));
}

export async function addItemComment(kind: ItemKind, itemId: string, userId: string, text: string) {
  const [row] = await db.insert(itemComments).values({ kind, itemId, userId, body: text }).returning();
  const [u] = await db.select({ name: users.name, avatar: users.avatarUrl }).from(users).where(eq(users.id, userId)).limit(1);
  return { id: row.id, author: u?.name ?? "", avatar: u?.avatar ?? "", body: row.body, ago: ago(row.createdAt), mine: true };
}

/** Anzahl sichtbarer (nicht ausgeblendeter) Kommentare je Ziel-ID (eine Abfrage für ganze Listen). */
export async function countItemComments(kind: ItemKind, itemIds: string[]): Promise<Map<string, number>> {
  if (!itemIds.length) return new Map();
  const rows = await db
    .select({ itemId: itemComments.itemId, n: count() })
    .from(itemComments)
    .where(and(eq(itemComments.kind, kind), inArray(itemComments.itemId, itemIds), isNull(itemComments.hiddenAt)))
    .groupBy(itemComments.itemId);
  return new Map(rows.map((r) => [r.itemId, r.n]));
}

import { and, asc, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import { itemComments, users } from "../db/schema.ts";
import { ago } from "./time.ts";

export type ItemKind = "post" | "hall";
export const itemCommentSchema = z.object({ text: z.string().trim().min(1).max(2000) }).strict();

export async function listItemComments(kind: ItemKind, itemId: string) {
  const rows = await db
    .select({ id: itemComments.id, body: itemComments.body, createdAt: itemComments.createdAt, name: users.name, avatar: users.avatarUrl })
    .from(itemComments)
    .innerJoin(users, eq(itemComments.userId, users.id))
    .where(and(eq(itemComments.kind, kind), eq(itemComments.itemId, itemId)))
    .orderBy(asc(itemComments.createdAt))
    .limit(200);
  return rows.map((r) => ({ id: r.id, author: r.name, avatar: r.avatar ?? "", body: r.body, ago: ago(r.createdAt) }));
}

export async function addItemComment(kind: ItemKind, itemId: string, userId: string, text: string) {
  const [row] = await db.insert(itemComments).values({ kind, itemId, userId, body: text }).returning();
  const [u] = await db.select({ name: users.name, avatar: users.avatarUrl }).from(users).where(eq(users.id, userId)).limit(1);
  return { id: row.id, author: u?.name ?? "", avatar: u?.avatar ?? "", body: row.body, ago: ago(row.createdAt) };
}

/** Anzahl je Ziel-ID (eine Abfrage für ganze Listen). */
export async function countItemComments(kind: ItemKind, itemIds: string[]): Promise<Map<string, number>> {
  if (!itemIds.length) return new Map();
  const rows = await db
    .select({ itemId: itemComments.itemId, n: count() })
    .from(itemComments)
    .where(and(eq(itemComments.kind, kind), inArray(itemComments.itemId, itemIds)))
    .groupBy(itemComments.itemId);
  return new Map(rows.map((r) => [r.itemId, r.n]));
}

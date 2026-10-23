import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { media } from "../db/schema.ts";
import { deleteObject } from "./s3.ts";

/**
 * Alle Spalten, in denen ein Bild als `/media/<uuid>` gespeichert wird (Tabelle, Spalte). Neue Bildspalten MÜSSEN hier
 * eingetragen werden, sonst räumt die Bereinigung das Bild ab (der Test `media-cleanup.integration.test.ts` prüft das gegen das Schema).
 */
export const MEDIA_REFERENCES = [
  ["users", "avatar_url"], ["users", "cover_url"], ["breeders", "avatar_url"],
  ["hall_entries", "avatar_url"], ["hall_entries", "image_url"], ["grows", "cover_url"], ["grow_photos", "url"],
  ["posts", "image_url"], ["conversations", "avatar_url"], ["messages", "image_url"], ["messages", "attachments"],
] as const;

/** Karenzzeit: frisch hochgeladene Bilder (noch nicht gespeichert, z. B. offener Dialog) werden nie als Waisen entfernt. */
export const ORPHAN_GRACE_HOURS = 24;

const usedBy = (idExpr: ReturnType<typeof sql>) =>
  sql.join(MEDIA_REFERENCES.map(([table, column]) =>
    sql`exists (select 1 from ${sql.identifier(table)} where position('/media/' || ${idExpr} in ${sql.identifier(column)}::text) > 0)`), sql` or `);

async function removeObjects(keys: (string | null)[]): Promise<void> {
  for (const key of keys) {
    if (key) await deleteObject(key).catch((error: Error) => console.error(JSON.stringify({ event: "storage_error", op: "delete", type: error.name })));
  }
}

const MEDIA_PATH = /^\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/**
 * Ein ersetztes/entferntes eigenes Bild löschen (Zeile und Objekt), sofern es nirgends mehr verwendet wird.
 * Externe URLs und fremde Bilder bleiben unberührt; Fehler machen die eigentliche Aktion nie rückgängig.
 */
export async function releaseMedia(ownerId: string, value: string | null | undefined): Promise<boolean> {
  const id = value ? MEDIA_PATH.exec(value)?.[1]?.toLowerCase() : undefined;
  if (!id) return false;
  try {
    const rows = await db.execute<{ used: boolean }>(sql`select (${usedBy(sql`${id}::text`)}) as used`);
    if (rows[0]?.used) return false;
    const deleted = await db.delete(media).where(and(eq(media.id, id), eq(media.ownerId, ownerId))).returning({ storageKey: media.storageKey });
    await removeObjects(deleted.map((row) => row.storageKey));
    return deleted.length > 0;
  } catch (error) {
    console.error(JSON.stringify({ event: "media_release_error", type: (error as Error).name }));
    return false;
  }
}

/** Nicht mehr verwendete Bilder (älter als die Karenzzeit) entfernen: z. B. abgebrochene Uploads, gelöschte Beiträge. */
export async function sweepOrphanMedia(limit = 200): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - ORPHAN_GRACE_HOURS * 3_600_000);
  const candidates = await db.execute<{ id: string }>(sql`
    select m.id from media m
    where m.created_at < ${cutoff.toISOString()}::timestamptz and not (${usedBy(sql`m.id::text`)})
    order by m.created_at limit ${limit}`);
  const ids = candidates.map((row) => row.id);
  if (!ids.length) return { deleted: 0 };
  const deleted = await db.delete(media).where(inArray(media.id, ids)).returning({ storageKey: media.storageKey });
  await removeObjects(deleted.map((row) => row.storageKey));
  return { deleted: deleted.length };
}

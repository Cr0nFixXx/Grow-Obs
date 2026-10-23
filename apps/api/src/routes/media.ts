import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { and, count, eq, sql } from "drizzle-orm";
import { db, resetDbConnection } from "../db/client.ts";
import { media } from "../db/schema.ts";
import { requireAuth, type AuthEnv } from "../middleware/auth.ts";
import { rateLimit, userKey } from "../middleware/rate-limit.ts";
import { markPhase, phaseMark } from "../lib/phase.ts";
import { uuid } from "../lib/validation.ts";
import { sniffImage } from "../lib/media-ref.ts";
import { deleteObject, mediaInStorage, putObject, signedGetUrl } from "../lib/s3.ts";

/**
 * Bilder (B-47, B-76): mit `MEDIA_STORAGE=s3` (und S3_*-Zugangsdaten) liegen die Bytes im privaten Bucket, `GET` leitet auf einen
 * kurzlebigen signierten Link um; ohne Zugangsdaten (Embedded/Entwicklung) in PostgreSQL. Upload: roher Body (JPEG/PNG/WebP, max. 2 MB, Format per Magic Bytes
 * geprüft, nicht per Header). Abruf: öffentlich über nicht erratbare UUID (für <img>, das keinen
 * Bearer-Header senden kann), mit restriktiver CSP/nosniff. Quote: 200 Bilder bzw. 100 MB je User.
 */
export const MEDIA_MAX_BYTES = 2 * 1024 * 1024;
const QUOTA_FILES = 200;
const QUOTA_BYTES = 100 * 1024 * 1024;

/**
 * B-80: Die erste Abfrage nach einer Pause hing in Produktion bis zur 12-s-Klammer (Upload → 503), obwohl die Tabelle winzig ist und
 * Folgeanfragen sofort liefen. Hängt die Abfrage länger als 4 s, wird die Verbindung verworfen und einmal neu versucht
 * (Antwort trägt dann `X-Db-Retry: 1`).
 */
async function withStallRetry<T>(c: { header(name: string, value: string): void }, run: () => PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stalled = new Promise<"stalled">((resolve) => { timer = setTimeout(() => resolve("stalled"), 4000); });
  const first = Promise.resolve(run());
  try {
    const result = await Promise.race([first, stalled]);
    if (result !== "stalled") return result;
  } finally {
    clearTimeout(timer);
  }
  void first.catch(() => undefined);
  c.header("X-Db-Retry", "1");
  await resetDbConnection({ force: true });
  return run();
}

export const mediaApi = new Hono<AuthEnv>();

mediaApi.post(
  "/",
  phaseMark("auth"),
  requireAuth,
  phaseMark("ratelimit"),
  rateLimit({ name: "media-upload", limit: 30, windowMs: 10 * 60 * 1000, keys: userKey }),
  phaseMark("body"),
  bodyLimit({ maxSize: MEDIA_MAX_BYTES, onError: (c) => c.json({ error: "Bild zu groß (max. 2 MB)" }, 413) }),
  async (c) => {
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (!bytes.length) return c.json({ error: "Leerer Upload" }, 400);
    const type = sniffImage(bytes);
    if (!type) return c.json({ error: "Nur JPEG, PNG oder WebP" }, 415);
    const ownerId = c.get("userId");
    markPhase(c, "quota");
    const readUsage = () =>
      db
        .select({ files: count(), bytes: sql<number>`coalesce(sum(${media.size}), 0)::int` })
        .from(media)
        .where(eq(media.ownerId, ownerId));
    const [usage] = await withStallRetry(c, readUsage);
    if ((usage?.files ?? 0) >= QUOTA_FILES || (usage?.bytes ?? 0) + bytes.length > QUOTA_BYTES) {
      return c.json({ error: "Speicherkontingent erschöpft" }, 413);
    }
    const id = randomUUID();
    if (mediaInStorage()) {
      const key = `media/${ownerId}/${id}`;
      markPhase(c, "storage-put");
      try {
        await putObject(key, bytes, type);
      } catch (error) {
        // Nur Fehlername, keine Zugangsdaten oder Pfade ins Protokoll.
        console.error(JSON.stringify({ event: "storage_error", op: "put", type: (error as Error).name }));
        return c.json({ error: "Bildspeicher nicht erreichbar – bitte später erneut versuchen" }, 502);
      }
      markPhase(c, "insert");
      try {
        await db.insert(media).values({ id, ownerId, contentType: type, size: bytes.length, storageKey: key });
      } catch (error) {
        await deleteObject(key).catch(() => undefined);
        throw error;
      }
    } else {
      await db.insert(media).values({ id, ownerId, contentType: type, size: bytes.length, data: Buffer.from(bytes) });
    }
    return c.json({ id, path: `/media/${id}`, contentType: type, size: bytes.length }, 201);
  },
);

mediaApi.get("/:id", async (c) => {
  const [row] = await db.select().from(media).where(eq(media.id, uuid(c.req.param("id")))).limit(1);
  if (!row) return c.json({ error: "Nicht gefunden" }, 404);
  if (row.storageKey) {
    // Link ist 1 h gültig, die Weiterleitung darf 30 min im Browser bleiben (läuft also nie mit abgelaufenem Link).
    c.header("Cache-Control", "private, max-age=1800");
    return c.redirect(await signedGetUrl(row.storageKey, 3600), 302);
  }
  if (!row.data) return c.json({ error: "Nicht gefunden" }, 404);
  c.header("Cache-Control", "private, max-age=86400, immutable");
  c.header("Content-Security-Policy", "default-src 'none'; sandbox");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Content-Disposition", "inline");
  return c.body(new Uint8Array(row.data), 200, { "Content-Type": row.contentType, "Content-Length": String(row.size) });
});

/** Löscht eigenes Bild (Referenzen in Posts/Galerien zeigen danach ein Platzhalterbild). */
mediaApi.delete("/:id", requireAuth, async (c) => {
  const deleted = await db.delete(media)
    .where(and(eq(media.id, uuid(c.req.param("id"))), eq(media.ownerId, c.get("userId")))).returning({ id: media.id, storageKey: media.storageKey });
  if (!deleted.length) return c.json({ error: "Nicht gefunden" }, 404);
  // Objekt best effort entfernen; ein Fehler macht das Löschen der Referenz nicht rückgängig.
  const key = deleted[0]?.storageKey;
  if (key) await deleteObject(key).catch((error: Error) => console.error(JSON.stringify({ event: "storage_error", op: "delete", type: error.name })));
  return c.json({ ok: true });
});

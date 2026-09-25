import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { and, count, eq, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { media } from "../db/schema.ts";
import { requireAuth, type AuthEnv } from "../middleware/auth.ts";
import { uuid } from "../lib/validation.ts";
import { sniffImage } from "../lib/media-ref.ts";

/**
 * Bilder in PostgreSQL (B-47). Upload: roher Body (JPEG/PNG/WebP, max. 2 MB, Format per Magic Bytes
 * geprüft, nicht per Header). Abruf: öffentlich über nicht erratbare UUID (für <img>, das keinen
 * Bearer-Header senden kann), mit restriktiver CSP/nosniff. Quote: 200 Bilder bzw. 100 MB je User.
 */
export const MEDIA_MAX_BYTES = 2 * 1024 * 1024;
const QUOTA_FILES = 200;
const QUOTA_BYTES = 100 * 1024 * 1024;

export const mediaApi = new Hono<AuthEnv>();

mediaApi.post(
  "/",
  requireAuth,
  bodyLimit({ maxSize: MEDIA_MAX_BYTES, onError: (c) => c.json({ error: "Bild zu groß (max. 2 MB)" }, 413) }),
  async (c) => {
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (!bytes.length) return c.json({ error: "Leerer Upload" }, 400);
    const type = sniffImage(bytes);
    if (!type) return c.json({ error: "Nur JPEG, PNG oder WebP" }, 415);
    const ownerId = c.get("userId");
    const [usage] = await db
      .select({ files: count(), bytes: sql<number>`coalesce(sum(${media.size}), 0)::int` })
      .from(media)
      .where(eq(media.ownerId, ownerId));
    if ((usage?.files ?? 0) >= QUOTA_FILES || (usage?.bytes ?? 0) + bytes.length > QUOTA_BYTES) {
      return c.json({ error: "Speicherkontingent erschöpft" }, 413);
    }
    const [row] = await db.insert(media).values({ ownerId, contentType: type, size: bytes.length, data: Buffer.from(bytes) })
      .returning({ id: media.id });
    return c.json({ id: row.id, path: `/media/${row.id}`, contentType: type, size: bytes.length }, 201);
  },
);

mediaApi.get("/:id", async (c) => {
  const [row] = await db.select().from(media).where(eq(media.id, uuid(c.req.param("id")))).limit(1);
  if (!row) return c.json({ error: "Nicht gefunden" }, 404);
  c.header("Cache-Control", "private, max-age=86400, immutable");
  c.header("Content-Security-Policy", "default-src 'none'; sandbox");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Content-Disposition", "inline");
  return c.body(new Uint8Array(row.data), 200, { "Content-Type": row.contentType, "Content-Length": String(row.size) });
});

/** Löscht eigenes Bild (Referenzen in Posts/Galerien zeigen danach ein Platzhalterbild). */
mediaApi.delete("/:id", requireAuth, async (c) => {
  const deleted = await db.delete(media)
    .where(and(eq(media.id, uuid(c.req.param("id"))), eq(media.ownerId, c.get("userId")))).returning({ id: media.id });
  if (!deleted.length) return c.json({ error: "Nicht gefunden" }, 404);
  return c.json({ ok: true });
});

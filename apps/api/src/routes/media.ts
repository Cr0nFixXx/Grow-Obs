import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { and, count, eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db, resetDbConnection } from "../db/client.ts";
import { conversationMembers, media } from "../db/schema.ts";
import { requireAuth, type AuthEnv } from "../middleware/auth.ts";
import { rateLimit, userKey } from "../middleware/rate-limit.ts";
import { markPhase, phaseMark } from "../lib/phase.ts";
import { uuid } from "../lib/validation.ts";
import { sniffImage } from "../lib/media-ref.ts";
import { FILE_EXTENSIONS, contentDisposition, fileExtension, mediaQuotaBytes, sanitizeFileName, sniffFile, uploadConfig, uploadMaxBytes } from "../lib/media-files.ts";
import { deleteObject, getObjectStream, mediaInStorage, putObject, signedGetUrl } from "../lib/s3.ts";

/**
 * Bilder (B-47, B-76): mit `MEDIA_STORAGE=s3` (und S3_*-Zugangsdaten) liegen die Bytes im privaten Bucket, `GET` leitet auf einen
 * kurzlebigen signierten Link um; ohne Zugangsdaten (Embedded/Entwicklung) in PostgreSQL. Upload: roher Body (JPEG/PNG/WebP bzw. mit `?kind=file&name=…` Dokumente der Positivliste, max. `UPLOAD_MAX_MB`, Format per Magic Bytes
 * geprüft, nicht per Header). Abruf (B-82): nur mit Login (HttpOnly-Cookie, wird auch für <img> mitgesendet); Chat-Anhänge
 * zusätzlich nur für Mitglieder der Unterhaltung und den Absender. Restriktive CSP/nosniff. Quote: 200 Objekte bzw. `MEDIA_QUOTA_MB` je User.
 */
const QUOTA_FILES = 200;
const MAX_BYTES = uploadMaxBytes();
const maxLabel = `${Math.round((MAX_BYTES / 1048576) * 10) / 10}`.replace(".", ",");

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

/** Upload-Grenzen für die Oberfläche (Dateigröße, HD-Auswahl); öffentlich, enthält nichts Geheimes. */
mediaApi.get("/config", (c) => c.json(uploadConfig()));

mediaApi.post(
  "/",
  phaseMark("auth"),
  requireAuth,
  phaseMark("ratelimit"),
  rateLimit({ name: "media-upload", limit: 30, windowMs: 10 * 60 * 1000, keys: userKey }),
  phaseMark("body"),
  bodyLimit({ maxSize: MAX_BYTES, onError: (c) => c.json({ error: `Datei zu groß (max. ${maxLabel} MB)` }, 413) }),
  async (c) => {
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (!bytes.length) return c.json({ error: "Leerer Upload" }, 400);
    // `?kind=file` (Chat-Anhänge): Positivliste für Dokumente; ohne diesen Parameter bleiben es nur Bilder (Profil, Beiträge, Grows).
    const wantsFile = c.req.query("kind") === "file";
    const fileName = sanitizeFileName(c.req.query("name"));
    const imageType = sniffImage(bytes);
    let type: string | null = imageType;
    if (!imageType) {
      if (!wantsFile) return c.json({ error: "Nur JPEG, PNG oder WebP" }, 415);
      type = sniffFile(fileName, bytes);
      if (!type) return c.json({ error: FILE_EXTENSIONS.includes(fileExtension(fileName)) ? "Der Inhalt passt nicht zur Dateiendung" : "Dateityp nicht erlaubt (PDF, Office, TXT, CSV, ZIP)" }, 415);
    }
    const kind = imageType ? "image" : "file";
    const storedName = wantsFile && fileName ? fileName : null;
    const ownerId = c.get("userId");
    markPhase(c, "quota");
    const readUsage = () =>
      db
        .select({ files: count(), bytes: sql<number>`coalesce(sum(${media.size}), 0)::int` })
        .from(media)
        .where(eq(media.ownerId, ownerId));
    const [usage] = await withStallRetry(c, readUsage);
    if ((usage?.files ?? 0) >= QUOTA_FILES || (usage?.bytes ?? 0) + bytes.length > mediaQuotaBytes()) {
      return c.json({ error: "Speicherkontingent erschöpft" }, 413);
    }
    const id = randomUUID();
    if (mediaInStorage()) {
      const key = `media/${ownerId}/${id}`;
      markPhase(c, "storage-put");
      try {
        await putObject(key, bytes, type!);
      } catch (error) {
        // Nur Fehlername, keine Zugangsdaten oder Pfade ins Protokoll.
        console.error(JSON.stringify({ event: "storage_error", op: "put", type: (error as Error).name }));
        return c.json({ error: "Bildspeicher nicht erreichbar – bitte später erneut versuchen" }, 502);
      }
      markPhase(c, "insert");
      try {
        await db.insert(media).values({ id, ownerId, contentType: type!, size: bytes.length, storageKey: key, fileName: storedName });
      } catch (error) {
        await deleteObject(key).catch(() => undefined);
        throw error;
      }
    } else {
      await db.insert(media).values({ id, ownerId, contentType: type!, size: bytes.length, data: Buffer.from(bytes), fileName: storedName });
    }
    return c.json({ id, path: `/media/${id}`, contentType: type, size: bytes.length, kind, name: storedName ?? "" }, 201);
  },
);

mediaApi.get("/:id", requireAuth, async (c) => {
  const [row] = await db.select().from(media).where(eq(media.id, uuid(c.req.param("id")))).limit(1);
  if (!row) return c.json({ error: "Nicht gefunden" }, 404);
  // Chat-Anhänge: nur Mitglieder der Unterhaltung (und der Absender). Antwort wie „nicht vorhanden“, damit nichts verraten wird.
  if (row.conversationId && row.ownerId !== c.get("userId")) {
    const [member] = await db.select({ userId: conversationMembers.userId }).from(conversationMembers)
      .where(and(eq(conversationMembers.conversationId, row.conversationId), eq(conversationMembers.userId, c.get("userId")))).limit(1);
    if (!member) return c.json({ error: "Nicht gefunden" }, 404);
  }
  // Dateien (und Bilder mit `?download=1`) werden immer heruntergeladen, nie im Browser gerendert.
  const isFile = !row.contentType.startsWith("image/");
  const download = isFile || c.req.query("download") === "1";
  const fileName = row.fileName || `${isFile ? "datei" : "bild"}-${row.id.slice(0, 8)}${isFile ? "" : `.${row.contentType.split("/")[1] === "jpeg" ? "jpg" : row.contentType.split("/")[1]}`}`;
  const disposition = download ? contentDisposition("attachment", fileName) : "inline";
  // `?raw=1`: PDF-Bytes über die API selbst liefern (für die Vorschau in der App; `fetch` folgt keiner Weiterleitung auf den Bucket ohne CORS). Nie im Browser angezeigt (attachment + CSP sandbox).
  if (c.req.query("raw") === "1") {
    if (row.contentType !== "application/pdf") return c.json({ error: "Nur für PDF" }, 400);
    c.header("Cache-Control", "private, no-store");
    c.header("Content-Security-Policy", "default-src 'none'; sandbox");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Content-Disposition", disposition);
    if (row.storageKey) {
      try {
        return c.body(await getObjectStream(row.storageKey), 200, { "Content-Type": row.contentType, "Content-Length": String(row.size) });
      } catch (error) {
        if (error instanceof HTTPException) throw error;
        console.error(JSON.stringify({ event: "storage_error", op: "get", type: (error as Error).name }));
        return c.json({ error: "Datei gerade nicht abrufbar" }, 502);
      }
    }
    if (!row.data) return c.json({ error: "Nicht gefunden" }, 404);
    return c.body(new Uint8Array(row.data), 200, { "Content-Type": row.contentType, "Content-Length": String(row.size) });
  }
  if (row.storageKey) {
    // Link ist 1 h gültig, die Weiterleitung darf 30 min im Browser bleiben (läuft also nie mit abgelaufenem Link).
    c.header("Cache-Control", "private, max-age=1800");
    return c.redirect(await signedGetUrl(row.storageKey, 3600, download ? { disposition, contentType: row.contentType } : {}), 302);
  }
  if (!row.data) return c.json({ error: "Nicht gefunden" }, 404);
  c.header("Cache-Control", "private, max-age=86400, immutable");
  c.header("Content-Security-Policy", "default-src 'none'; sandbox");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Content-Disposition", disposition);
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

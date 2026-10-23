import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Agent as HttpAgent } from "node:http";
import { Agent as HttpsAgent } from "node:https";
import { HTTPException } from "hono/http-exception";
import { env } from "../env.ts";

/** Ohne Zugangsdaten (nur Embedded-Modus erlaubt) ist der Object Storage deaktiviert. */
export const storageConfigured = !!(env.S3_ACCESS_KEY && env.S3_SECRET_KEY);

/** Liegen neue Bilder im Bucket (`MEDIA_STORAGE=s3`) statt in PostgreSQL? */
export const mediaInStorage = (): boolean => env.MEDIA_STORAGE === "s3" && storageConfigured;

// Keine wiederverwendeten Verbindungen (B-80): Auf Serverless liegen Sockets zwischen zwei Anfragen eingefroren herum; der Bucket hat sie
// längst geschlossen, und die erste Anfrage danach hing, bis das Zeitlimit abließ (gemessen: Upload nach ~95 s Pause 3 von 3 Mal > 12 s).
const requestHandler = {
  httpAgent: new HttpAgent({ keepAlive: false }),
  httpsAgent: new HttpsAgent({ keepAlive: false }),
  connectionTimeout: 3000,
  requestTimeout: process.env.VERCEL ? 6000 : 30_000,
};

function client(endpoint: string, extra: { maxAttempts?: number } = {}) {
  if (!env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) return null;
  return new S3Client({
    requestHandler,
    endpoint,
    region: env.S3_REGION,
    credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    forcePathStyle: true,
    // Prüfsummen nur, wenn das Protokoll sie verlangt (S3-kompatible Dienste wie Supabase/MinIO).
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    ...extra,
  });
}

export const storageClient = client(env.S3_ENDPOINT, { maxAttempts: 1 });

// Sign the browser-reachable origin. Replacing a presigned URL's host breaks its signature.
const uploadClient = client(env.S3_PUBLIC_ENDPOINT);
// Serverseitige Objektzugriffe (Upload/Löschen) mit einem Wiederholungsversuch.
const objectClient = client(env.S3_ENDPOINT, { maxAttempts: 2 });

/** Erzeugt eine Presigned URL für einen direkten Client-Upload (5 Min). */
export async function presignUpload(key: string, contentType: string, size: number): Promise<string> {
  if (!uploadClient) throw new HTTPException(503, { message: "Object Storage nicht konfiguriert" });
  return getSignedUrl(
    uploadClient,
    new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ContentType: contentType, ContentLength: size }),
    { expiresIn: 300, signableHeaders: new Set(["content-type", "content-length"]) }
  );
}

export async function checkStorage(signal: AbortSignal): Promise<void> {
  if (!storageClient) throw new Error("storage not configured");
  await storageClient.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }), { abortSignal: signal });
}

/** Bild-Bytes in den Bucket legen (serverseitig, nach Magic-Byte-Prüfung). */
export async function putObject(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  if (!objectClient) throw new Error("storage not configured");
  await objectClient.send(
    new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: bytes, ContentType: contentType, ContentLength: bytes.length, CacheControl: "private, max-age=86400" }),
    { abortSignal: AbortSignal.timeout(process.env.VERCEL ? 9_000 : 120_000) }, // Vercel: beide Versuche zusammen, die Anfrage insgesamt endet nach 12 s; eigener Host: große Dateien (bis 50 MB)
  );
}

export async function deleteObject(key: string): Promise<void> {
  if (!objectClient) throw new Error("storage not configured");
  await objectClient.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), { abortSignal: AbortSignal.timeout(10_000) });
}

/** Objekt serverseitig lesen (PDF-Vorschau im Browser: `fetch` folgt keiner Weiterleitung auf einen fremden Origin ohne CORS). */
export async function getObjectStream(key: string): Promise<ReadableStream<Uint8Array>> {
  if (!objectClient) throw new Error("storage not configured");
  const out = await objectClient.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), { abortSignal: AbortSignal.timeout(process.env.VERCEL ? 9_000 : 60_000) });
  if (!out.Body) throw new Error("empty object");
  return out.Body.transformToWebStream() as ReadableStream<Uint8Array>;
}

/** Kurzlebiger, signierter Lese-Link (Bucket bleibt privat). Signiert mit dem vom Browser erreichbaren Origin. */
export async function signedGetUrl(key: string, expiresIn = 3600, response: { disposition?: string; contentType?: string } = {}): Promise<string> {
  if (!uploadClient) throw new HTTPException(503, { message: "Object Storage nicht konfiguriert" });
  return getSignedUrl(uploadClient, new GetObjectCommand({
    Bucket: env.S3_BUCKET, Key: key,
    ...(response.disposition ? { ResponseContentDisposition: response.disposition } : {}),
    ...(response.contentType ? { ResponseContentType: response.contentType } : {}),
  }), { expiresIn });
}

import { HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { HTTPException } from "hono/http-exception";
import { env } from "../env.ts";

/** Ohne Zugangsdaten (nur Embedded-Modus erlaubt) ist der Object Storage deaktiviert. */
export const storageConfigured = !!(env.S3_ACCESS_KEY && env.S3_SECRET_KEY);

function client(endpoint: string, extra: { maxAttempts?: number } = {}) {
  if (!env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) return null;
  return new S3Client({
    endpoint,
    region: env.S3_REGION,
    credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    forcePathStyle: true,
    ...extra,
  });
}

export const storageClient = client(env.S3_ENDPOINT, { maxAttempts: 1 });

// Sign the browser-reachable origin. Replacing a presigned URL's host breaks its signature.
const uploadClient = client(env.S3_PUBLIC_ENDPOINT);

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

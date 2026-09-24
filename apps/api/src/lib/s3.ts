import { HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env.js";

export const storageClient = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
  forcePathStyle: true,
  maxAttempts: 1,
});

// Sign the browser-reachable origin. Replacing a presigned URL's host breaks its signature.
const uploadClient = new S3Client({
  endpoint: env.S3_PUBLIC_ENDPOINT,
  region: env.S3_REGION,
  credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
  forcePathStyle: true,
});

/** Erzeugt eine Presigned URL für einen direkten Client-Upload (5 Min). */
export async function presignUpload(key: string, contentType: string, size: number): Promise<string> {
  return getSignedUrl(
    uploadClient,
    new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ContentType: contentType, ContentLength: size }),
    { expiresIn: 300, signableHeaders: new Set(["content-type", "content-length"]) }
  );
}

export async function checkStorage(signal: AbortSignal): Promise<void> {
  await storageClient.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }), { abortSignal: signal });
}

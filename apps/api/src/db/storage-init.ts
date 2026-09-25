import { CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { storageClient } from "../lib/s3.ts";
import { env } from "../env.ts";

if (!storageClient) throw new Error("S3_ACCESS_KEY/S3_SECRET_KEY fehlen – Storage-Init nicht möglich");
const s3 = storageClient;
try {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status !== 404) throw error;
    await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
  }
  console.log("Private storage bucket ready; no anonymous access policy was added.");
} catch (error) {
  console.error("Storage initialization failed:", error instanceof Error ? error.name : "unknown");
  process.exitCode = 1;
} finally { s3.destroy(); }
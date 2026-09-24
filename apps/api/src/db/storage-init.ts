import { CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { storageClient } from "../lib/s3.js";
import { env } from "../env.js";

try {
  try {
    await storageClient.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status !== 404) throw error;
    await storageClient.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
  }
  console.log("Private storage bucket ready; no anonymous access policy was added.");
} catch (error) {
  console.error("Storage initialization failed:", error instanceof Error ? error.name : "unknown");
  process.exitCode = 1;
} finally { storageClient.destroy(); }
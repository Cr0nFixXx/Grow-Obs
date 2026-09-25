import { z } from "zod";

export const environmentSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32).refine(
    (value) => !/please-change|replace-me|changeme/i.test(value),
    "Use a randomly generated secret, not the example placeholder",
  ),
  JWT_TTL: z.string().regex(/^\d+[smhd]$/).default("1h"),
  S3_ENDPOINT: z.string().url().default("http://localhost:9000"),
  S3_PUBLIC_ENDPOINT: z.string().url().default("http://localhost:9000"),
  S3_REGION: z.string().default("us-east-1"),
  /** Optional nur im Embedded-Modus (ohne Storage → Uploads liefern 503). */
  S3_ACCESS_KEY: z.string().min(1).optional(),
  S3_SECRET_KEY: z.string().min(8).optional(),
  S3_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/).default("growobserver"),
  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:5173"),
  ALLOW_DEMO_SEED: z.enum(["true", "false"]).default("false"),
  /**
   * "true", wenn die API in Next.js unter /api läuft (same-origin, siehe app/api/[...route]).
   * Dann sind CORS-Header wirkungslos und Object Storage ist optional.
   */
  API_EMBEDDED: z.enum(["true", "false"]).default("false"),
  SEED_ADMIN_EMAIL: z.string().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
}).superRefine((env, ctx) => {
  const origins = env.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (!origins.length || origins.some((origin) => {
    try { const url = new URL(origin); return !["http:", "https:"].includes(url.protocol) || url.origin !== origin; }
    catch { return true; }
  })) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["CORS_ORIGINS"], message: "Provide explicit HTTP(S) origins without paths" });
  const embedded = env.API_EMBEDDED === "true";
  const storageConfigured = !!(env.S3_ACCESS_KEY && env.S3_SECRET_KEY);
  if (!embedded && !storageConfigured) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["S3_ACCESS_KEY"], message: "Standalone API requires object storage credentials" });
  }
  // Same-origin (embedded) sendet keine Cross-Origin-Requests → Regel nur für Standalone.
  if (!embedded && env.NODE_ENV === "production" && origins.some((origin) => !origin.startsWith("https://"))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["CORS_ORIGINS"], message: "Production browser origins must use HTTPS" });
  }
  if (storageConfigured && env.NODE_ENV === "production" && !env.S3_PUBLIC_ENDPOINT.startsWith("https://")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["S3_PUBLIC_ENDPOINT"], message: "Production uploads must use HTTPS" });
  }
});
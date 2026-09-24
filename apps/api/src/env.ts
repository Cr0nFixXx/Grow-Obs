import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { environmentSchema } from "./config/environment.js";

// Docker injects environment variables; local Node 22 tooling can use apps/api/.env.
if (process.env.NODE_ENV !== "test" && existsSync(".env")) loadEnvFile(".env");

const parsed = environmentSchema.safeParse(process.env);
if (!parsed.success) {
  const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
  throw new Error(`Invalid API configuration: ${fields.join(", ")}`);
}
export const env = parsed.data;
export const corsOrigins = env.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);

import { sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { env } from "../env.ts";
import { checkStorage, storageConfigured } from "./s3.ts";

export async function systemHealth() {
  const started = Date.now();
  const database = async () => {
    const start = Date.now();
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL statement_timeout = '3000ms'`);
        await tx.execute(sql`SELECT 1`);
      });
      return { ok: true, status: "ok" as const, hint: "Postgres erreichbar", latencyMs: Date.now() - start };
    } catch {
      return { ok: false, status: "down" as const, hint: "Datenbankpruefung fehlgeschlagen", latencyMs: Date.now() - start };
    }
  };
  const storage = async () => {
    const start = Date.now();
    if (!storageConfigured) {
      return { ok: true, status: "unknown" as const, hint: "Kein Object Storage konfiguriert (Uploads deaktiviert)", latencyMs: 0 };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      await checkStorage(controller.signal);
      return { ok: true, status: "ok" as "ok" | "unknown", hint: "Privater Bucket erreichbar", latencyMs: Date.now() - start };
    } catch {
      return { ok: false, status: "down" as const, hint: "Storage-Pruefung fehlgeschlagen", latencyMs: Date.now() - start };
    } finally { clearTimeout(timer); }
  };
  const [dbStatus, storageStatus] = await Promise.all([database(), storage()]);
  return {
    ok: dbStatus.ok && storageStatus.ok,
    mode: env.NODE_ENV,
    latencyMs: Date.now() - started,
    version: "0.1.0",
    services: {
      api: { ok: true, status: "ok" as const, hint: "API erreichbar" },
      db: dbStatus,
      storage: storageStatus,
      ai: { ok: false, status: "unknown" as const, hint: "Noch kein KI-Provider implementiert" },
    },
  };
}
import { z } from "zod";

export const environmentSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32).refine(
    (value) => !/please-change|replace-me|changeme/i.test(value),
    "Use a randomly generated secret, not the example placeholder",
  ),
  /** Maximale Sitzungsdauer („Angemeldet bleiben“); Sitzungen sind serverseitig widerrufbar. */
  JWT_TTL: z.string().regex(/^\d+[smhd]$/).default("30d"),
  /**
   * Maximale Datenbankverbindungen dieser Instanz (Standard 10). Auf Serverless (Vercel) klein halten (z. B. 3):
   * jede Instanz öffnet einen eigenen Pool, und gepoolte Anbieter (Supabase/Neon) haben nur wenige Plätze.
   */
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  /** "true" überspringt die Migrationen beim API-Start (nur eingebetteter Modus). Erst setzen, wenn das Schema aktuell ist. */
  SKIP_MIGRATIONS: z.enum(["true", "false"]).default("false"),
  S3_ENDPOINT: z.string().url().default("http://localhost:9000"),
  S3_PUBLIC_ENDPOINT: z.string().url().default("http://localhost:9000"),
  S3_REGION: z.string().default("us-east-1"),
  /** Optional nur im Embedded-Modus (ohne Storage → Uploads liefern 503). */
  S3_ACCESS_KEY: z.string().min(1).optional(),
  S3_SECRET_KEY: z.string().min(8).optional(),
  /**
   * Wo hochgeladene Bilder (`POST /media`) liegen: `database` (Standard, PostgreSQL) oder `s3` (privater Bucket, B-76; braucht
   * S3_*-Zugangsdaten). Bewusst kein Automatismus: Zugangsdaten allein ändern nie, wo Bilder landen.
   */
  MEDIA_STORAGE: z.enum(["database", "s3"]).default("database"),
  /** Größtes Upload-Objekt in MB (Bild oder Datei). Standard: 4 auf Vercel (Plattformgrenze ca. 4,5 MB je Anfrage), sonst 50. */
  UPLOAD_MAX_MB: z.coerce.number().min(0.1).max(500).optional(),
  /** Speicherkontingent je Nutzer in MB. Standard: 100 auf Vercel/Supabase (kleiner Speicher), sonst 1000. */
  MEDIA_QUOTA_MB: z.coerce.number().min(1).max(100000).optional(),
  S3_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/).default("growobserver"),
  /**
   * SameSite des Sitzungs-Cookies. `lax` (Standard) ist richtig für same-origin/same-site-Betrieb.
   * `none` (→ Secure + Partitioned) nur für Einbettung in einen fremden Rahmen (z. B. iframe-Vorschau), sonst verwirft
   * der Browser das Cookie in diesem Cross-Site-Kontext. Der CSRF-Guard bleibt in beiden Fällen aktiv.
   */
  COOKIE_SAMESITE: z.enum(["lax", "none"]).default("lax"),
  /**
   * Nur für Umgebungen, in denen ein Proxy `Cookie`/`Authorization` nicht bis zur App durchreicht (z. B. die Sandbox-Vorschau):
   * "true" → Login/Registrierung liefern zusätzlich `token` im Body, und der Header `X-Session-Token` wird akzeptiert.
   * Das Token ist dann für JavaScript lesbar (schwächer als HttpOnly) – Standard "false", nicht in Produktion einschalten.
   */
  ALLOW_HEADER_SESSION: z.enum(["true", "false"]).default("false"),
  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:5173"),
  /** Geheimnis für den Wochenreport-Aufruf (`GET /api/cron/weekly-report`, Header `Authorization: Bearer …`). Ohne Wert ist der Endpunkt aus (404). Vercel Cron sendet den Header automatisch. */
  CRON_SECRET: z.string().min(16).optional(),
  ALLOW_DEMO_SEED: z.enum(["true", "false"]).default("false"),
  /**
   * "true", wenn die API in Next.js unter /api läuft (same-origin, siehe app/api/[...route]).
   * Dann sind CORS-Header wirkungslos und Object Storage ist optional.
   */
  API_EMBEDDED: z.enum(["true", "false"]).default("false"),
  /**
   * Web-Push (B-63): VAPID-Schlüsselpaar (`npm run push:keys --prefix apps/api`) und Kontakt (`mailto:` oder `https:`).
   * Fehlt eines davon, ist Push aus (die App zeigt es ehrlich an); alle drei zusammen aktivieren es.
   */
  VAPID_PUBLIC_KEY: z.string().regex(/^[A-Za-z0-9_-]{80,100}$/, "VAPID public key (base64url) expected").optional(),
  VAPID_PRIVATE_KEY: z.string().regex(/^[A-Za-z0-9_-]{40,50}$/, "VAPID private key (base64url) expected").optional(),
  VAPID_SUBJECT: z.string().regex(/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/, "VAPID_SUBJECT must be mailto:… or https://…").optional(),
  /**
   * E-Mail-Versand (B-87) über einen beliebigen SMTP-Server. Mit SMTP_HOST + SMTP_FROM ist Versand an: dann ist die
   * E-Mail-Bestätigung Pflicht und der Passwort-Reset per Link verfügbar. Ohne beides ist Versand aus (Registrierung wie
   * bisher, Reset nur durch Betreiber). Port 465 verwendet TLS von Anfang an, sonst STARTTLS, falls der Server es anbietet.
   */
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  SMTP_FROM: z.string().min(3).max(200).optional(),
  /** Öffentliche Adresse der App für Links in E-Mails (ohne Pfad, mit https://). Ersatzweise NEXT_PUBLIC_SITE_URL. */
  APP_URL: z.string().url().optional(),
  SEED_ADMIN_EMAIL: z.string().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
}).superRefine((env, ctx) => {
  const vapid = [env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY, env.VAPID_SUBJECT].filter(Boolean).length;
  if (vapid !== 0 && vapid !== 3) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["VAPID_PUBLIC_KEY"], message: "Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT together (or none)" });
  if (Boolean(env.SMTP_HOST) !== Boolean(env.SMTP_FROM)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["SMTP_HOST"], message: "Set SMTP_HOST and SMTP_FROM together (or none)" });
  if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASS)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["SMTP_USER"], message: "Set SMTP_USER and SMTP_PASS together (or none)" });
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
  if (env.MEDIA_STORAGE === "s3" && !storageConfigured) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["MEDIA_STORAGE"], message: "MEDIA_STORAGE=s3 requires S3_ACCESS_KEY and S3_SECRET_KEY" });
  }
  // Same-origin (embedded) sendet keine Cross-Origin-Requests → Regel nur für Standalone.
  if (!embedded && env.NODE_ENV === "production" && origins.some((origin) => !origin.startsWith("https://"))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["CORS_ORIGINS"], message: "Production browser origins must use HTTPS" });
  }
  if (storageConfigured && env.NODE_ENV === "production" && !env.S3_PUBLIC_ENDPOINT.startsWith("https://")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["S3_PUBLIC_ENDPOINT"], message: "Production uploads must use HTTPS" });
  }
});
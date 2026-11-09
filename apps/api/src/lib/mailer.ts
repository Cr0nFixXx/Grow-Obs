import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../env.ts";

/**
 * E-Mail-Versand (B-87). Transport-Abstraktion, damit Tests und Entwicklung ohne Mailserver laufen:
 * - `smtp`: echter Versand über SMTP_HOST/SMTP_FROM (Produktion).
 * - `console`: schreibt die Mail ins Log (nur Entwicklung; `MAIL_TRANSPORT=console`, nie in Produktion).
 * - `memory`: sammelt Mails in `outbox` (nur Tests; `MAIL_TRANSPORT=memory`, nie in Produktion).
 * - `off`: nichts konfiguriert – dann gibt es weder Bestätigungspflicht noch Reset-per-Link.
 * `MAIL_TRANSPORT` wird zur Laufzeit gelesen (testbar) und in Produktion ignoriert.
 */
export type MailMode = "smtp" | "console" | "memory" | "off";

export interface MailMessage { to: string; subject: string; text: string; html?: string }

export function mailMode(): MailMode {
  const forced = process.env.MAIL_TRANSPORT;
  if (process.env.NODE_ENV !== "production" && (forced === "console" || forced === "memory")) return forced;
  return env.SMTP_HOST && env.SMTP_FROM ? "smtp" : "off";
}

export const mailEnabled = () => mailMode() !== "off";
/** Die E-Mail-Bestätigung ist nur Pflicht, solange Mails auch ankommen können (sonst würde niemand mehr hineinkommen). */
export const emailVerificationRequired = mailEnabled;

/** Öffentliche Basis-Adresse für Links in Mails – bewusst nie aus der Anfrage (Host-Header-Manipulation). */
export function appUrl(): string {
  const raw = env.APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

/** Gesendete Mails (nur `memory`); neueste zuletzt. */
export const outbox: MailMessage[] = [];
export const clearOutbox = () => { outbox.length = 0; };

let transporter: Transporter | null = null;
function smtp(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    ...(env.SMTP_USER && env.SMTP_PASS ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } } : {}),
    // Serverless: lieber schnell scheitern als eine Funktion lange blockieren.
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 12_000,
  });
  return transporter;
}

/** Sendet eine Mail. Liefert `false` bei Fehler oder ohne Versand (nie eine Ausnahme; geloggt wird nur ein Fehlercode, keine Adresse). */
export async function sendMail(message: MailMessage): Promise<boolean> {
  const mode = mailMode();
  if (mode === "off") return false;
  if (mode === "memory") { outbox.push(message); return true; }
  if (mode === "console") {
    console.log(`[mail] An: ${message.to}\n[mail] Betreff: ${message.subject}\n${message.text}`);
    return true;
  }
  try {
    await smtp().sendMail({ from: env.SMTP_FROM, to: message.to, subject: message.subject, text: message.text, ...(message.html ? { html: message.html } : {}) });
    return true;
  } catch (error) {
    const code = (error as { code?: string }).code ?? "unknown";
    console.warn(`[mail] Versand fehlgeschlagen (${String(code).slice(0, 40)})`);
    return false;
  }
}

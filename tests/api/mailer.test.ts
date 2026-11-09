import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startSmtpSink } from "./support/smtp-sink.ts";

const BASE = { DATABASE_URL: "postgres://u:p@127.0.0.1:5432/x_test", JWT_SECRET: "j".repeat(40), NODE_ENV: "test" };
const KEYS = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "APP_URL", "MAIL_TRANSPORT", "NEXT_PUBLIC_SITE_URL"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => { for (const key of [...KEYS, ...Object.keys(BASE)]) saved[key] = process.env[key]; for (const key of KEYS) delete process.env[key]; Object.assign(process.env, BASE); vi.resetModules(); });
afterEach(() => { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });

/** Lädt das Mailmodul frisch, damit die Umgebung neu gelesen wird (SMTP_* werden beim Import geprüft). */
const load = () => import("../../apps/api/src/lib/mailer.ts");

describe("Mail-Transport", () => {
  it("ohne Konfiguration ist der Versand aus: keine Pflicht, sendMail liefert false", async () => {
    const mailer = await load();
    expect(mailer.mailMode()).toBe("off");
    expect(mailer.emailVerificationRequired()).toBe(false);
    expect(await mailer.sendMail({ to: "a@example.invalid", subject: "x", text: "y" })).toBe(false);
  });

  it("memory und console gelten nur außerhalb der Produktion", async () => {
    process.env.MAIL_TRANSPORT = "memory";
    const mailer = await load();
    expect(mailer.mailMode()).toBe("memory");
    await mailer.sendMail({ to: "a@example.invalid", subject: "x", text: "y" });
    expect(mailer.outbox).toHaveLength(1);
    process.env.NODE_ENV = "production";
    expect(mailer.mailMode()).toBe("off");
    expect(await mailer.sendMail({ to: "b@example.invalid", subject: "x", text: "y" })).toBe(false);
    expect(mailer.outbox).toHaveLength(1);
  });

  it("SMTP_HOST und SMTP_FROM müssen zusammen gesetzt werden", async () => {
    process.env.SMTP_HOST = "mail.example.invalid";
    await expect(load()).rejects.toThrow(/SMTP_HOST/);
  });

  it("verschickt über SMTP an den konfigurierten Server (Absender, Empfänger, Betreff, Text, HTML)", async () => {
    const sink = await startSmtpSink();
    try {
      Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: String(sink.port), SMTP_FROM: "Grow|Observer <noreply@example.invalid>" });
      const mailer = await load();
      expect(mailer.mailMode()).toBe("smtp");
      expect(mailer.emailVerificationRequired()).toBe(true);
      const ok = await mailer.sendMail({ to: "mia@example.invalid", subject: "Passwort zurücksetzen", text: "Hallo Mia", html: "<p>Hallo Mia</p>" });
      expect(ok).toBe(true);
      expect(sink.mails).toHaveLength(1);
      expect(sink.mails[0]!.from).toBe("noreply@example.invalid");
      expect(sink.mails[0]!.to).toEqual(["mia@example.invalid"]);
      expect(sink.mails[0]!.data).toMatch(/Subject: =\?UTF-8\?/);
      expect(sink.mails[0]!.data).toContain("<p>Hallo Mia</p>");
    } finally { await sink.close(); }
  });

  it("ein nicht erreichbarer Server liefert false statt einer Ausnahme", async () => {
    Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "1", SMTP_FROM: "noreply@example.invalid" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const mailer = await load();
    expect(await mailer.sendMail({ to: "mia@example.invalid", subject: "x", text: "y" })).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).not.toContain("mia@example.invalid"); // keine Adresse im Log
    warn.mockRestore();
  });

  it("Links verwenden APP_URL, sonst NEXT_PUBLIC_SITE_URL, nie die Anfrage; Name wird in HTML maskiert", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://site.example.invalid/";
    let mailer = await load();
    expect(mailer.appUrl()).toBe("https://site.example.invalid");
    process.env.APP_URL = "https://app.example.invalid";
    vi.resetModules(); mailer = await load();
    expect(mailer.appUrl()).toBe("https://app.example.invalid");
    const { resetPasswordMail } = await import("../../apps/api/src/lib/mail-templates.ts");
    const mail = resetPasswordMail("x@example.invalid", "<b>Mia</b>", "T".repeat(43));
    expect(mail.text).toContain(`https://app.example.invalid/#reset=${"T".repeat(43)}`);
    expect(mail.html).toContain("&lt;b&gt;Mia&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>Mia</b>");
  });
});

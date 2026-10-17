import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = fileURLToPath(new URL("../drizzle/", import.meta.url));

describe("Migrationen", () => {
  it("Journal und SQL-Dateien sind konsistent (lückenlos, aufsteigende Zeitstempel, Datei vorhanden)", () => {
    const journal = JSON.parse(readFileSync(`${dir}meta/_journal.json`, "utf8")) as { entries: { idx: number; when: number; tag: string }[] };
    journal.entries.forEach((entry, index) => {
      expect(entry.idx).toBe(index);
      if (index > 0) expect(entry.when).toBeGreaterThan(journal.entries[index - 1]!.when);
      expect(() => readFileSync(`${dir}${entry.tag}.sql`, "utf8")).not.toThrow();
    });
  });

  it("0011 legt die gemeinsame Rate-Limit-Tabelle an (Hash-Schlüssel, Ablaufindex, UNLOGGED)", () => {
    const sql = readFileSync(`${dir}0011_rate_limits.sql`, "utf8");
    expect(sql).toMatch(/CREATE UNLOGGED TABLE "rate_limits"/);
    expect(sql).toMatch(/"key" text PRIMARY KEY/);
    expect(sql).toMatch(/"reset_at" timestamp with time zone NOT NULL/);
    expect(sql).toMatch(/CREATE INDEX "rate_limits_reset_idx"/);
  });

  it("0010 ergänzt Leseposition, Direktnachrichten-Schlüssel (eindeutig, nur wenn gesetzt) und Online-Status", () => {
    const sql = readFileSync(`${dir}0010_chat_realtime.sql`, "utf8");
    expect(sql).toContain('"last_read_at" timestamp with time zone DEFAULT now() NOT NULL');
    expect(sql).toContain('"online_until" timestamp with time zone');
    expect(sql).toMatch(/CREATE UNIQUE INDEX "conversations_direct_key_uq"[^;]*WHERE "direct_key" IS NOT NULL/);
    expect(sql).toContain("messages_conversation_created_idx");
  });

  it("0009 ergänzt die Pflichtwechsel-Spalte mit Standard false", () => {
    const sql = readFileSync(`${dir}0009_must_change_password.sql`, "utf8");
    expect(sql).toContain('"must_change_password" boolean DEFAULT false NOT NULL');
  });

  it("0008 legt das Anmeldeprotokoll ohne IP-Spalte an", () => {
    const sql = readFileSync(`${dir}0008_login_events.sql`, "utf8");
    expect(sql).toContain('CREATE TABLE "login_events"');
    expect(sql).toMatch(/ON DELETE cascade/);
    expect(sql.replace(/^--.*$/gm, "").toLowerCase()).not.toMatch(/\bip\b|ip_address/); // Kommentare ausgenommen
  });

  it("0007 legt die Sitzungs-Tabelle mit Kaskade und Indizes an", () => {
    const sql = readFileSync(`${dir}0007_sessions.sql`, "utf8");
    expect(sql).toContain('CREATE TABLE "sessions"');
    expect(sql).toMatch(/ON DELETE cascade/);
    expect(sql).toContain("sessions_user_idx");
    expect(sql).toContain("sessions_expires_idx");
  });

  it("0006 legt alle Standard-Forumbereiche idempotent an (Forum ist auf frischer DB ohne Seed nutzbar)", () => {
    const sql = readFileSync(`${dir}0006_default_forum_subs.sql`, "utf8");
    for (const name of ["r/GrowTagebuch", "r/LivingSoil", "r/Automatik", "r/Schädlinge", "r/DIY", "r/Erntezeit"]) expect(sql).toContain(`'${name}'`);
    expect(sql).toMatch(/ON CONFLICT \(name\) DO NOTHING/);
  });
});

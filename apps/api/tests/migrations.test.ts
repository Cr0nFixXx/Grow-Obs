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

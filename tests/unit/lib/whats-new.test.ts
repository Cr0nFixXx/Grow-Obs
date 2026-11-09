import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHANGELOG_URL, WHATS_NEW, initialSeenId, unseenChanges, type WhatsNewEntry } from "@/lib/whats-new";

const e = (id: string): WhatsNewEntry => ({ id, date: "2026-10-01", title: id, notes: ["a", "b", "c"] });
const list = [e("B-3"), e("B-2"), e("B-1")];

describe("whats-new Daten (Pflegeregeln)", () => {
  it("jeder Eintrag hat 3–5 Stichpunkte, Titel, ISO-Datum und eine eindeutige Kennung", () => {
    expect(WHATS_NEW.length).toBeGreaterThan(0);
    expect(new Set(WHATS_NEW.map((x) => x.id)).size).toBe(WHATS_NEW.length);
    for (const x of WHATS_NEW) {
      expect(x.id).toMatch(/^B-\d+$/);
      expect(x.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(x.title.trim()).not.toBe("");
      expect(x.notes.length).toBeGreaterThanOrEqual(3);
      expect(x.notes.length).toBeLessThanOrEqual(5);
      for (const n of x.notes) expect(n.trim()).not.toBe("");
    }
  });
  it("neueste zuerst (Datum und B-Nummer absteigend)", () => {
    for (let i = 1; i < WHATS_NEW.length; i += 1) {
      expect(WHATS_NEW[i - 1]!.date >= WHATS_NEW[i]!.date).toBe(true);
      expect(Number(WHATS_NEW[i - 1]!.id.slice(2))).toBeGreaterThan(Number(WHATS_NEW[i]!.id.slice(2)));
    }
  });
  it("jeder Eintrag hat eine Überschrift im detaillierten Changelog", () => {
    const changelog = readFileSync("docs/CHANGELOG.md", "utf8");
    for (const x of WHATS_NEW) expect(changelog).toContain(`### ${x.id} –`);
  });
  it("Changelog-Link zeigt auf docs/CHANGELOG.md", () => expect(CHANGELOG_URL).toMatch(/^https:\/\/.+\/docs\/CHANGELOG\.md$/));
});

describe("unseenChanges / initialSeenId", () => {
  it("zeigt nur Neueres als die gesehene Kennung", () => {
    expect(unseenChanges(list, "B-3")).toEqual([]);
    expect(unseenChanges(list, "B-2").map((x) => x.id)).toEqual(["B-3"]);
    expect(unseenChanges(list, "B-1").map((x) => x.id)).toEqual(["B-3", "B-2"]);
  });
  it("null (frisch) → nichts; unbekannt/leer (Bestandsinstallation) → alles", () => {
    expect(unseenChanges(list, null)).toEqual([]);
    expect(unseenChanges(list, "")).toHaveLength(3);
    expect(unseenChanges(list, "B-0")).toHaveLength(3);
  });
  it("Startzustand: gespeichert gewinnt; sonst Bestand → leer, frisch → neueste Kennung", () => {
    expect(initialSeenId("B-2", false, list)).toBe("B-2");
    expect(initialSeenId(null, true, list)).toBe("");
    expect(initialSeenId(null, false, list)).toBe("B-3");
    expect(initialSeenId(null, false, [])).toBeNull();
  });
});

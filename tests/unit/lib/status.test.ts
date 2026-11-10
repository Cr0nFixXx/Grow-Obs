import { describe, expect, it } from "vitest";
import { liveIsActive, liveRemaining, liveTextError, statusLabel, statusTextError } from "@/lib/status";

const now = new Date("2026-10-01T12:00:00Z");
const inMs = (ms: number) => new Date(now.getTime() + ms).toISOString();

describe("liveRemaining", () => {
  it("formatiert Stunden und Minuten", () => {
    expect(liveRemaining(inMs(3 * 3_600_000 + 20 * 60_000), now)).toBe("noch 3 Std. 20 Min.");
    expect(liveRemaining(inMs(2 * 3_600_000), now)).toBe("noch 2 Std.");
    expect(liveRemaining(inMs(12 * 60_000), now)).toBe("noch 12 Min.");
  });
  it("rundet auf und zeigt nie 0 Minuten", () => {
    expect(liveRemaining(inMs(5_000), now)).toBe("noch 1 Min.");
  });
  it("liefert null bei Ablauf, fehlendem oder ungültigem Zeitpunkt", () => {
    expect(liveRemaining(inMs(0), now)).toBeNull();
    expect(liveRemaining(inMs(-1000), now)).toBeNull();
    expect(liveRemaining(null, now)).toBeNull();
    expect(liveRemaining("kein-datum", now)).toBeNull();
  });
});

describe("liveIsActive", () => {
  it("braucht Inhalt und eine Restzeit", () => {
    expect(liveIsActive({ text: "Hi", image: "", expiresAt: inMs(60_000) }, now)).toBe(true);
    expect(liveIsActive({ text: "", image: "/media/x", expiresAt: inMs(60_000) }, now)).toBe(true);
    expect(liveIsActive({ text: "", image: "", expiresAt: inMs(60_000) }, now)).toBe(false);
    expect(liveIsActive({ text: "Hi", image: "", expiresAt: inMs(-60_000) }, now)).toBe(false);
    expect(liveIsActive(null, now)).toBe(false);
  });
});

describe("Eingabeprüfung", () => {
  it("Textstatus höchstens 80 Zeichen", () => {
    expect(statusTextError("x".repeat(80))).toBe("");
    expect(statusTextError("x".repeat(81))).not.toBe("");
    expect(statusTextError("")).toBe("");
  });
  it("24h-Status: Text oder Foto, höchstens 140 Zeichen", () => {
    expect(liveTextError("", false)).not.toBe("");
    expect(liveTextError("  ", false)).not.toBe("");
    expect(liveTextError("", true)).toBe("");
    expect(liveTextError("x".repeat(140), false)).toBe("");
    expect(liveTextError("x".repeat(141), true)).not.toBe("");
  });
  it("statusLabel verbindet Emoji und Text", () => {
    expect(statusLabel({ emoji: "🌱", text: "Woche 3" })).toBe("🌱 Woche 3");
    expect(statusLabel({ emoji: "", text: "Nur Text" })).toBe("Nur Text");
    expect(statusLabel(null)).toBe("");
  });
});

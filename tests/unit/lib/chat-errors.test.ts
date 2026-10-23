import { describe, expect, it } from "vitest";
import { sendErrorText } from "@/lib/chat-errors";

describe("sendErrorText", () => {
  it("übersetzt Netzwerkfehler", () => {
    expect(sendErrorText(new TypeError("Failed to fetch"))).toMatch(/Keine Verbindung/);
    expect(sendErrorText(new Error("Load failed"))).toMatch(/Keine Verbindung/);
    expect(sendErrorText(new Error("API nicht erreichbar"))).toMatch(/Keine Verbindung/);
    expect(sendErrorText(new Error("Zeitlimit der Anfrage erreicht"))).toMatch(/Keine Verbindung/);
  });
  it("übersetzt den generischen Serverfehler", () => {
    expect(sendErrorText(new Error("Interner Fehler"))).toMatch(/Server hatte kurz ein Problem/);
  });
  it("erkennt Rate-Limits", () => {
    expect(sendErrorText(new Error("Zu viele Anfragen"))).toMatch(/Zu viele Nachrichten/);
  });
  it("lässt konkrete Meldungen unverändert und fängt Leeres ab", () => {
    expect(sendErrorText(new Error("Du darfst hier nicht schreiben."))).toBe("Du darfst hier nicht schreiben.");
    expect(sendErrorText(undefined)).toMatch(/Unbekannter Fehler/);
    expect(sendErrorText("")).toMatch(/Unbekannter Fehler/);
  });
});

import { describe, expect, it } from "vitest";
import { buildMessage, categoryOfNotification, DEFAULT_PREFS, formatClock, inQuietHours, isAllowedEndpoint, minutesOfDay, parseClock, targetPath } from "../src/lib/push-core.ts";

const quiet = (start: string, end: string, timezone = "UTC") => ({ quietEnabled: true, quietStart: parseClock(start)!, quietEnd: parseClock(end)!, timezone });
const at = (iso: string) => new Date(iso);

describe("Push: Kategorien", () => {
  it("ordnet Benachrichtigungstypen den vier Kategorien zu", () => {
    expect(categoryOfNotification("forum")).toBe("community");
    expect(categoryOfNotification("grow")).toBe("grows");
    expect(categoryOfNotification("task")).toBe("grows");
    for (const t of ["shop", "ai", "system"] as const) expect(categoryOfNotification(t)).toBe("other");
  });
  it("liefert nur App-interne Zielpfade", () => {
    for (const t of ["chat", "forum", "grow", "task", "shop", "ai", "system"] as const) expect(targetPath(t)).toMatch(/^\/[a-z]*$/);
    expect(targetPath("chat")).toBe("/chat");
  });
});

describe("Push: Ruhezeit", () => {
  it("Fenster über Mitternacht (22:00–07:00)", () => {
    const q = quiet("22:00", "07:00");
    expect(inQuietHours(q, at("2026-10-20T23:30:00Z"))).toBe(true);
    expect(inQuietHours(q, at("2026-10-20T03:00:00Z"))).toBe(true);
    expect(inQuietHours(q, at("2026-10-20T07:00:00Z"))).toBe(false); // Ende exklusiv
    expect(inQuietHours(q, at("2026-10-20T12:00:00Z"))).toBe(false);
    expect(inQuietHours(q, at("2026-10-20T22:00:00Z"))).toBe(true); // Start inklusiv
  });
  it("Fenster am selben Tag (13:00–15:00) und Start = Ende (nie)", () => {
    expect(inQuietHours(quiet("13:00", "15:00"), at("2026-10-20T14:00:00Z"))).toBe(true);
    expect(inQuietHours(quiet("13:00", "15:00"), at("2026-10-20T15:00:00Z"))).toBe(false);
    expect(inQuietHours(quiet("08:00", "08:00"), at("2026-10-20T08:00:00Z"))).toBe(false);
  });
  it("rechnet in der Zeitzone des Nutzers (inkl. Sommer-/Winterzeit)", () => {
    // 20.10.2026 = MESZ (UTC+2), 20.12.2026 = MEZ (UTC+1)
    expect(minutesOfDay(at("2026-10-20T21:30:00Z"), "Europe/Berlin")).toBe(23 * 60 + 30);
    expect(minutesOfDay(at("2026-12-20T21:30:00Z"), "Europe/Berlin")).toBe(22 * 60 + 30);
    expect(inQuietHours(quiet("22:00", "07:00", "Europe/Berlin"), at("2026-10-20T19:30:00Z"))).toBe(false); // 21:30 lokal
    expect(inQuietHours(quiet("22:00", "07:00", "Europe/Berlin"), at("2026-10-20T20:30:00Z"))).toBe(true); // 22:30 lokal
  });
  it("ungültige Zeitzone fällt auf UTC zurück; deaktiviert → nie", () => {
    expect(minutesOfDay(at("2026-10-20T10:15:00Z"), "Nowhere/Land")).toBe(10 * 60 + 15);
    expect(inQuietHours({ ...quiet("00:00", "23:59"), quietEnabled: false }, at("2026-10-20T10:00:00Z"))).toBe(false);
  });
  it("parst und formatiert Uhrzeiten strikt", () => {
    expect(parseClock("07:05")).toBe(425);
    for (const bad of ["7:05", "24:00", "12:60", "", "12-30", "ab:cd"]) expect(parseClock(bad)).toBeNull();
    expect(formatClock(425)).toBe("07:05");
    expect(formatClock(parseClock("23:59")!)).toBe("23:59");
  });
});

describe("Push: Inhalt", () => {
  it("ist standardmäßig neutral (keine Namen/Texte auf dem Sperrbildschirm)", () => {
    const m = buildMessage({ category: "messages", title: "Anna", body: "Treffen wir uns um 5?", url: "/chat", preview: false });
    expect(m.title).toBe("Neue Nachricht");
    expect(JSON.stringify(m)).not.toMatch(/Anna|Treffen/);
    expect(m.url).toBe("/chat");
  });
  it("zeigt mit Vorschau den echten Inhalt, gekürzt", () => {
    const m = buildMessage({ category: "messages", title: "Anna", body: "x".repeat(500), url: "/chat", preview: true });
    expect(m.title).toBe("Anna");
    expect(m.body.length).toBe(140);
  });
  it("Vorschau ohne Titel fällt auf den neutralen Text zurück; Standard-Einstellungen: alles an, Vorschau/Ruhezeit aus", () => {
    expect(buildMessage({ category: "grows", title: "  ", url: "/grows", preview: true }).title).toBe("Neues zu deinem Grow");
    expect(DEFAULT_PREFS).toMatchObject({ messages: true, community: true, grows: true, other: true, showPreview: false, quietEnabled: false });
  });
});

describe("Push: erlaubte Endpunkte (SSRF-Schutz)", () => {
  it("akzeptiert die Push-Dienste der Browser", () => {
    for (const url of ["https://fcm.googleapis.com/fcm/send/abc", "https://updates.push.services.mozilla.com/wpush/v2/abc", "https://web.push.apple.com/QAbc", "https://wns2-par02p.notify.windows.com/w/?token=x"]) expect(isAllowedEndpoint(url)).toBe(true);
  });
  it("lehnt alles andere ab (interne Adressen, HTTP, Zugangsdaten, Lookalikes, Ports)", () => {
    for (const url of ["http://fcm.googleapis.com/x", "https://localhost/x", "https://127.0.0.1/x", "https://169.254.169.254/latest", "https://evil.example/fcm.googleapis.com", "https://fcm.googleapis.com.evil.example/x", "https://notfcm.googleapis.com.evil/x", "https://user:pw@fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x", "ftp://fcm.googleapis.com/x", "not a url", `https://fcm.googleapis.com/${"a".repeat(2100)}`]) expect(isAllowedEndpoint(url), url).toBe(false);
  });
});

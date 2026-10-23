import { describe, expect, it } from "vitest";
import { expiryLabel, freeSlots, inviteSummary, resolveTopic, showSenderName, topicBadges, unreadOutsideMuted, writeBlockReason } from "@/lib/chat-groups";
import type { GroupTopic } from "@/services/interfaces";

const topic = (over: Partial<GroupTopic> = {}): GroupTopic => ({ id: "t", name: "Allgemein", emoji: "", isDefault: false, private: false, adminsOnly: false, closed: false, pinned: false, canWrite: true, unread: 0, muted: false, ...over });

describe("Gruppen-Hilfen (B-65)", () => {
  it("writeBlockReason nennt den Grund, sonst null", () => {
    expect(writeBlockReason(topic())).toBeNull();
    expect(writeBlockReason(null)).toBeNull();
    expect(writeBlockReason(topic({ canWrite: false, closed: true }))).toMatch(/geschlossen/);
    expect(writeBlockReason(topic({ canWrite: false, adminsOnly: true }))).toMatch(/nur Admins/);
  });

  it("resolveTopic: gewähltes, sonst Standard, sonst erstes", () => {
    const topics = [topic({ id: "a", name: "A" }), topic({ id: "d", isDefault: true }), topic({ id: "c" })];
    expect(resolveTopic(topics, "c")?.id).toBe("c");
    expect(resolveTopic(topics, "gone")?.id).toBe("d");
    expect(resolveTopic(topics, null)?.id).toBe("d");
    expect(resolveTopic([topic({ id: "x" })], null)?.id).toBe("x");
    expect(resolveTopic([], null)).toBeNull();
  });

  it("unreadOutsideMuted lässt stumme Themen aus", () => {
    expect(unreadOutsideMuted([topic({ unread: 2 }), topic({ unread: 5, muted: true }), topic({ unread: 1 })])).toBe(3);
  });

  it("showSenderName: nur bei fremden Nachrichten und wechselndem Absender", () => {
    const list = [
      { from: "them" as const, senderId: "a", kind: "user" as const },
      { from: "them" as const, senderId: "a", kind: "user" as const },
      { from: "them" as const, senderId: "b", kind: "user" as const },
      { from: "me" as const, senderId: "me", kind: "user" as const },
      { from: "them" as const, senderId: "me2", kind: "system" as const },
      { from: "them" as const, senderId: "b", kind: "user" as const },
    ];
    expect(list.map((_, i) => showSenderName(list, i))).toEqual([true, false, true, false, false, true]);
  });

  it("expiryLabel", () => {
    const now = Date.parse("2026-10-20T12:00:00Z");
    expect(expiryLabel("2026-10-27T12:00:00Z", now)).toBe("läuft in 7 Tagen ab");
    expect(expiryLabel("2026-10-22T11:00:00Z", now)).toBe("läuft in 2 Tagen ab");
    expect(expiryLabel("2026-10-21T13:00:00Z", now)).toBe("läuft in 2 Tagen ab");
    expect(expiryLabel("2026-10-20T20:00:00Z", now)).toBe("läuft heute ab");
    expect(expiryLabel("2026-10-19T12:00:00Z", now)).toBe("abgelaufen");
    expect(expiryLabel("kaputt", now)).toBe("abgelaufen");
  });

  it("freeSlots zählt offene Einladungen mit und wird nie negativ", () => {
    expect(freeSlots({ memberCount: 5, invites: [{}, {}] as never, maxMembers: 20 })).toBe(13);
    expect(freeSlots({ memberCount: 20, invites: [{}] as never, maxMembers: 20 })).toBe(0);
  });

  it("topicBadges und inviteSummary", () => {
    expect(topicBadges(topic({ pinned: true, private: true, adminsOnly: true, muted: true }))).toEqual(["angeheftet", "privat", "nur Admins", "stumm"]);
    expect(topicBadges(topic({ closed: true, adminsOnly: true }))).toEqual(["geschlossen"]);
    expect(inviteSummary({ invited: ["a"], skipped: [] })).toBe("1 Einladung gesendet");
    expect(inviteSummary({ invited: ["a", "b"], skipped: [{ reason: "Ist schon Mitglied" }, { reason: "Ist schon Mitglied" }] })).toBe("2 Einladungen gesendet · 2 übersprungen (ist schon mitglied)");
    expect(inviteSummary({ invited: [], skipped: [] })).toBe("Nichts zu tun");
  });
});

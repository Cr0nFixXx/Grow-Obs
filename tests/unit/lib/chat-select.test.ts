import { describe, expect, it } from "vitest";
import { canDeleteMessage, copyPayload, quoteBody, quoteName, quoteOf, selectionActions, toggleId } from "@/lib/chat-select";
import type { ChatMessage } from "@/services/interfaces";

const msg = (id: string, over: Partial<ChatMessage> = {}): ChatMessage => ({ id, from: "them", text: `Text ${id}`, time: "", senderName: "Ben", ...over });

describe("Chat-Auswahl (B-94)", () => {
  const a = msg("a", { from: "me" });
  const b = msg("b");
  const gone = msg("g", { deleted: true, text: "" });
  const system = msg("s", { kind: "system" });

  it("Antworten nur bei genau einer normalen Nachricht und wenn geschrieben werden darf", () => {
    expect(selectionActions([b], { groupAdmin: false, canWrite: true }).reply).toBe(true);
    expect(selectionActions([a, b], { groupAdmin: false, canWrite: true }).reply).toBe(false);
    expect(selectionActions([b], { groupAdmin: false, canWrite: false }).reply).toBe(false);
    expect(selectionActions([gone], { groupAdmin: false, canWrite: true }).reply).toBe(false);
    expect(selectionActions([system], { groupAdmin: false, canWrite: true }).reply).toBe(false);
  });
  it("Löschen nur, wenn alle löschbar sind: eigene, oder als Gruppen-Admin alle", () => {
    expect(selectionActions([a], { groupAdmin: false, canWrite: true }).remove).toBe(true);
    expect(selectionActions([a, b], { groupAdmin: false, canWrite: true }).remove).toBe(false);
    expect(selectionActions([a, b], { groupAdmin: true, canWrite: true }).remove).toBe(true);
    expect(selectionActions([], { groupAdmin: true, canWrite: true }).remove).toBe(false);
    expect(canDeleteMessage(gone, true)).toBe(false);
    expect(canDeleteMessage(system, true)).toBe(false);
  });
  it("Kopieren braucht Text (reine Bild-Nachricht nicht)", () => {
    expect(selectionActions([msg("i", { text: "" })], { groupAdmin: false, canWrite: true }).copy).toBe(false);
    expect(selectionActions([b], { groupAdmin: false, canWrite: true }).copy).toBe(true);
  });
  it("toggleId verändert das Original nicht", () => {
    const base = new Set(["a"]);
    expect([...toggleId(base, "b")].sort()).toEqual(["a", "b"]);
    expect([...toggleId(base, "a")]).toEqual([]);
    expect([...base]).toEqual(["a"]);
  });
  it("Kopieren: eine Nachricht roh, mehrere chronologisch mit Namen", () => {
    const list = [msg("1", { text: "Hallo", senderName: "Ben" }), msg("2", { from: "me", text: "Hi" }), msg("3", { text: "", senderName: "Ben" })];
    const name = (m: ChatMessage) => (m.from === "me" ? "Du" : m.senderName ?? "");
    expect(copyPayload(list, new Set(["1"]), name)).toBe("Hallo");
    expect(copyPayload(list, new Set(["2", "1", "3"]), name)).toBe("Ben: Hallo\nDu: Hi");
  });
  it("Zitat: Name, Text, gelöscht, Anhang", () => {
    expect(quoteName({ from: "me", senderName: "x" })).toBe("Du");
    expect(quoteName({ from: "them", senderName: "" })).toBe("Unbekannt");
    expect(quoteBody({ deleted: true, text: "", hasAttachment: false })).toBe("Nachricht gelöscht");
    expect(quoteBody({ deleted: false, text: "", hasAttachment: true })).toBe("📎 Anhang");
    expect(quoteBody({ deleted: false, text: "Hi", hasAttachment: true })).toBe("Hi");
    expect(quoteOf(msg("q", { text: "y".repeat(200), image: "/media/1" }), "Ben")).toMatchObject({ id: "q", hasAttachment: true, deleted: false });
    expect(quoteOf(msg("q", { text: "y".repeat(200) }), "Ben").text.length).toBe(140);
  });
});

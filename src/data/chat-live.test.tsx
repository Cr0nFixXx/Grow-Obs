// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealtimeContext } from "@/lib/realtime-context";
import type { RealtimeEvent } from "@/lib/realtime";
import type { ConversationItem } from "@/services/interfaces";

const conv = (id: string, extra: Partial<ConversationItem> = {}): ConversationItem => ({ id, name: `Chat ${id}`, avatar: "", online: false, last: "", time: "", unread: 0, partnerId: `p-${id}`, ...extra });

const chat = {
  listConversations: vi.fn(async () => [conv("c1", { unread: 2 }), conv("c2")]),
  getMessages: vi.fn(async () => []),
  sendMessage: vi.fn(async () => ({ id: "m", from: "me" as const, text: "x", time: "jetzt" })),
  startDirect: vi.fn(async (userId: string) => conv(`dm-${userId}`)),
  markRead: vi.fn(async () => undefined),
  unreadTotal: vi.fn(async () => 3),
  searchPeople: vi.fn(async () => []),
};
const forum = { getThread: vi.fn(async () => ({ id: "t1", commentsList: [] })) };
const services = { chat, forum }; // stabil wie die echte Service-Registry
vi.mock("@/data/DataContext", () => ({ useServices: () => services }));

// Nach dem Mock importieren
const hooksPromise = import("./hooks");

const listeners = new Set<(e: RealtimeEvent) => void>();
const realtime = { status: "ws" as const, subscribe: vi.fn(() => vi.fn()), typing: vi.fn(), on: (l: (e: RealtimeEvent) => void) => { listeners.add(l); return () => listeners.delete(l); } };
const emit = (event: RealtimeEvent) => act(async () => { for (const l of [...listeners]) l(event); await Promise.resolve(); });
const wrapper = ({ children }: { children: ReactNode }) => <RealtimeContext.Provider value={realtime}>{children}</RealtimeContext.Provider>;

describe("useChat live (B-59)", () => {
  beforeEach(() => {
    listeners.clear();
    Object.values(chat).forEach((fn) => fn.mockClear());
    realtime.typing.mockClear();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("wählt die erste Konversation und markiert ungelesene als gelesen", async () => {
    const { useChat } = await hooksPromise;
    const { result } = renderHook(() => useChat(), { wrapper });
    await waitFor(() => expect(result.current.activeId).toBe("c1"));
    await waitFor(() => expect(chat.markRead).toHaveBeenCalledWith("c1"));
  });

  it("chat.message für die offene Konversation: Nachrichten + Liste neu laden und als gelesen markieren", async () => {
    const { useChat } = await hooksPromise;
    const { result } = renderHook(() => useChat(), { wrapper });
    await waitFor(() => expect(result.current.activeId).toBe("c1"));
    chat.getMessages.mockClear(); chat.listConversations.mockClear(); chat.markRead.mockClear();
    await emit({ type: "chat.message", conversationId: "c1" });
    await waitFor(() => expect(chat.getMessages).toHaveBeenCalledTimes(1));
    expect(chat.listConversations).toHaveBeenCalled();
    await waitFor(() => expect(chat.markRead).toHaveBeenCalledWith("c1"));
  });

  it("chat.message für eine andere Konversation lädt nur die Liste (kein Lesen, keine Nachrichten)", async () => {
    const { useChat } = await hooksPromise;
    const { result } = renderHook(() => useChat(), { wrapper });
    await waitFor(() => expect(result.current.activeId).toBe("c1"));
    chat.getMessages.mockClear(); chat.markRead.mockClear();
    await emit({ type: "chat.message", conversationId: "c2" });
    await waitFor(() => expect(chat.listConversations.mock.calls.length).toBeGreaterThan(1));
    expect(chat.getMessages).not.toHaveBeenCalled();
    expect(chat.markRead).not.toHaveBeenCalledWith("c2");
  });

  it("Tab im Hintergrund: Nachricht wird nicht als gelesen markiert", async () => {
    const { useChat } = await hooksPromise;
    const { result } = renderHook(() => useChat(), { wrapper });
    await waitFor(() => expect(result.current.activeId).toBe("c1"));
    chat.markRead.mockClear();
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    await emit({ type: "chat.message", conversationId: "c1" });
    await waitFor(() => expect(chat.getMessages).toHaveBeenCalled());
    expect(chat.markRead).not.toHaveBeenCalled();
  });

  it("„schreibt …“ erscheint für die richtige Konversation, endet nach 5 s oder mit der Nachricht", async () => {
    const { useChat } = await hooksPromise;
    const { result } = renderHook(() => useChat(), { wrapper });
    await waitFor(() => expect(result.current.activeId).toBe("c1"));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await emit({ type: "chat.typing", conversationId: "c2" });
    expect(result.current.typing).toBe(false); // c2 ist nicht offen
    expect(result.current.typingIds.has("c2")).toBe(true);
    await emit({ type: "chat.typing", conversationId: "c1" });
    expect(result.current.typing).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(5100); });
    expect(result.current.typing).toBe(false);
    await emit({ type: "chat.typing", conversationId: "c1" });
    expect(result.current.typing).toBe(true);
    await emit({ type: "chat.message", conversationId: "c1" });
    expect(result.current.typing).toBe(false);
  });

  it("presence-Ereignis ändert den Online-Status der Gegenstelle; resync verwirft ihn", async () => {
    const { useChat } = await hooksPromise;
    const { result } = renderHook(() => useChat(), { wrapper });
    await waitFor(() => expect(result.current.conversations).toHaveLength(2));
    expect(result.current.conversations[0]!.online).toBe(false);
    await emit({ type: "presence", userId: "p-c1", online: true });
    expect(result.current.conversations[0]!.online).toBe(true);
    expect(result.current.conversations[1]!.online).toBe(false);
    await emit({ type: "resync" });
    await waitFor(() => expect(result.current.conversations[0]!.online).toBe(false));
  });

  it("eigene Eingabe wird höchstens alle 3 s gemeldet", async () => {
    const { useChat } = await hooksPromise;
    const { result } = renderHook(() => useChat(), { wrapper });
    await waitFor(() => expect(result.current.activeId).toBe("c1"));
    act(() => { result.current.notifyTyping(); result.current.notifyTyping(); result.current.notifyTyping(); });
    expect(realtime.typing).toHaveBeenCalledTimes(1);
    expect(realtime.typing).toHaveBeenCalledWith("c1");
  });

  it("openDirect startet/öffnet die Direktnachricht und wählt sie aus", async () => {
    const { useChat } = await hooksPromise;
    const { result } = renderHook(() => useChat(), { wrapper });
    await waitFor(() => expect(result.current.activeId).toBe("c1"));
    await act(async () => { await result.current.openDirect("u9"); });
    expect(chat.startDirect).toHaveBeenCalledWith("u9");
    expect(result.current.activeId).toBe("dm-u9");
  });

  it("Polling-Rückfall: poll lädt Liste und offene Nachrichten", async () => {
    const { useChat } = await hooksPromise;
    const { result } = renderHook(() => useChat(), { wrapper });
    await waitFor(() => expect(result.current.activeId).toBe("c1"));
    chat.getMessages.mockClear();
    await emit({ type: "poll" });
    await waitFor(() => expect(chat.getMessages).toHaveBeenCalled());
  });
});

describe("Badge & Thread live (B-59)", () => {
  afterEach(() => { cleanup(); });
  beforeEach(() => { listeners.clear(); Object.values(chat).forEach((fn) => fn.mockClear()); forum.getThread.mockClear(); realtime.subscribe.mockClear(); });

  it("useChatUnread lädt bei Echtzeit-Ereignissen über die Brücke neu", async () => {
    const { useChatUnread, useRealtimeBridge } = await hooksPromise;
    const { result } = renderHook(() => { useRealtimeBridge(); return useChatUnread(true); }, { wrapper });
    await waitFor(() => expect(result.current).toBe(3));
    chat.unreadTotal.mockResolvedValueOnce(7);
    await emit({ type: "chat.message", conversationId: "c9" });
    await waitFor(() => expect(result.current).toBe(7));
  });

  it("useChatUnread(false) fragt nichts ab", async () => {
    const { useChatUnread } = await hooksPromise;
    const { result } = renderHook(() => useChatUnread(false), { wrapper });
    await waitFor(() => expect(result.current).toBe(0));
    expect(chat.unreadTotal).not.toHaveBeenCalled();
  });

  it("useThread abonniert das Thema und lädt bei thread.comment (nur für diesen Thread) neu", async () => {
    const { useThread } = await hooksPromise;
    renderHook(() => useThread("t1"), { wrapper });
    await waitFor(() => expect(forum.getThread).toHaveBeenCalledTimes(1));
    expect(realtime.subscribe).toHaveBeenCalledWith("thread:t1");
    await emit({ type: "thread.comment", threadId: "andere" });
    await act(async () => { await Promise.resolve(); });
    expect(forum.getThread).toHaveBeenCalledTimes(1);
    await emit({ type: "thread.comment", threadId: "t1" });
    await waitFor(() => expect(forum.getThread).toHaveBeenCalledTimes(2));
  });
});

// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RealtimeClientOptions } from "@/lib/realtime";

const created: { opts: RealtimeClientOptions; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn>; typing: ReturnType<typeof vi.fn> }[] = [];
vi.mock("@/lib/realtime", () => ({
  RealtimeClient: class {
    start = vi.fn(); stop = vi.fn(); subscribe = vi.fn(() => vi.fn()); typing = vi.fn();
    constructor(public opts: RealtimeClientOptions) { created.push(this as never); }
  },
}));

const { RealtimeProvider, useRealtime, useRealtimeEvent, useRealtimeTopic } = await import("@/lib/realtime-context");

function Probe({ onEvent, topic }: { onEvent: (type: string) => void; topic?: string }) {
  const { status } = useRealtime();
  useRealtimeEvent(["thread.comment", "poll"], (e) => onEvent(e.type));
  useRealtimeTopic(topic ?? null);
  return <span data-testid="status">{status}</span>;
}

describe("RealtimeProvider (B-59)", () => {
  beforeEach(() => { created.length = 0; vi.useFakeTimers(); Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("deaktiviert (Mock-Modus): kein Client, Status offline", () => {
    const { getByTestId } = render(<RealtimeProvider enabled={false}><Probe onEvent={() => undefined} topic="thread:x" /></RealtimeProvider>);
    expect(created).toHaveLength(0);
    expect(getByTestId("status").textContent).toBe("offline");
  });

  it("startet/stoppt den Client mit dem Lebenszyklus, Themen werden schon vor dem Start angemeldet", () => {
    const { unmount } = render(<RealtimeProvider enabled><Probe onEvent={() => undefined} topic="thread:abc" /></RealtimeProvider>);
    expect(created).toHaveLength(1);
    expect(created[0]!.start).toHaveBeenCalledTimes(1);
    expect(created[0]!.subscribe).toHaveBeenCalledWith("thread:abc");
    unmount();
    expect(created[0]!.stop).toHaveBeenCalled();
  });

  it("filtert Ereignisse nach Typ", () => {
    const seen: string[] = [];
    render(<RealtimeProvider enabled><Probe onEvent={(t) => seen.push(t)} /></RealtimeProvider>);
    act(() => { created[0]!.opts.onEvent({ type: "thread.comment" }); created[0]!.opts.onEvent({ type: "presence" }); });
    expect(seen).toEqual(["thread.comment"]);
  });

  it("Polling-Status: alle 8 s ein poll-Ereignis, nur bei sichtbarem Tab; sonst keins", () => {
    const seen: string[] = [];
    const { getByTestId } = render(<RealtimeProvider enabled><Probe onEvent={(t) => seen.push(t)} /></RealtimeProvider>);
    act(() => created[0]!.opts.onStatus("sse"));
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(seen).toEqual([]);
    act(() => created[0]!.opts.onStatus("polling"));
    expect(getByTestId("status").textContent).toBe("polling");
    act(() => { vi.advanceTimersByTime(16_500); });
    expect(seen).toEqual(["poll", "poll"]);
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    act(() => { vi.advanceTimersByTime(16_500); });
    expect(seen).toHaveLength(2);
    act(() => created[0]!.opts.onStatus("ws"));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(seen).toHaveLength(2); // Polling endet mit dem Statuswechsel
  });
});

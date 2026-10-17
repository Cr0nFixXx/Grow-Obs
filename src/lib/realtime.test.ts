// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backoffDelay, RealtimeClient, socketUrl, type RealtimeEvent, type RealtimeStatus } from "./realtime";

class FakeSocket {
  static instances: FakeSocket[] = [];
  static throwOnConstruct = false;
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    if (FakeSocket.throwOnConstruct) throw new Error("blocked");
    FakeSocket.instances.push(this);
  }
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.(); }
  message(event: unknown) { this.onmessage?.({ data: JSON.stringify(event) }); }
  drop(code = 1006) { this.readyState = 3; this.onclose?.({ code }); }
}

/** Steuerbarer SSE-Strom für `fetch`. */
function sseFetch() {
  const streams: { push: (event: unknown) => void; end: () => void; init: RequestInit; url: string }[] = [];
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    if (!url.endsWith("/realtime/stream")) return new Response(null, { status: 204 });
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({ start(c) { controller = c; } });
    const encoder = new TextEncoder();
    streams.push({ init, url, push: (event) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)), end: () => controller.close() });
    return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  });
  return { impl, streams, calls };
}

const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

describe("RealtimeClient", () => {
  let events: RealtimeEvent[];
  let statuses: RealtimeStatus[];
  let client: RealtimeClient;
  let sse: ReturnType<typeof sseFetch>;
  const make = (extra: Partial<ConstructorParameters<typeof RealtimeClient>[0]> = {}) => {
    client = new RealtimeClient({ baseUrl: "/api", getToken: () => null, onEvent: (e) => events.push(e), onStatus: (s) => statuses.push(s), ...extra });
    return client;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    events = []; statuses = []; FakeSocket.instances = []; FakeSocket.throwOnConstruct = false;
    sse = sseFetch();
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal("fetch", sse.impl);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });
  afterEach(() => { client?.stop(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("baut die WebSocket-URL aus Basis und Seitenadresse (http→ws, https→wss)", () => {
    expect(socketUrl("/api", { href: "https://app.example/grows" })).toBe("wss://app.example/api/realtime/ws");
    expect(socketUrl("http://localhost:4000", { href: "http://localhost:3000/" })).toBe("ws://localhost:4000/realtime/ws");
  });

  it("Backoff wächst exponentiell bis 30 s und streut ±25 %", () => {
    expect([0, 1, 2, 3].map((n) => backoffDelay(n, () => 0.5))).toEqual([1000, 2000, 4000, 8000]);
    expect(backoffDelay(20, () => 0.5)).toBe(30000);
    expect(backoffDelay(0, () => 0)).toBe(750);
    expect(backoffDelay(0, () => 1)).toBe(1250);
  });

  it("verbindet per WebSocket: Status ws erst nach hello, Ereignisse werden weitergereicht", () => {
    make().start();
    const ws = FakeSocket.instances[0]!;
    expect(statuses).toEqual(["connecting"]);
    ws.open();
    expect(client.getStatus()).toBe("connecting"); // erst hello zählt
    ws.message({ type: "hello", connId: "c1", transport: "ws" });
    expect(client.getStatus()).toBe("ws");
    ws.message({ type: "chat.message", conversationId: "x" });
    ws.message({ type: "pong" });
    expect(events).toEqual([{ type: "chat.message", conversationId: "x" }]);
  });

  it("sendet das Token als erste Nachricht, wenn eines vorhanden ist (Cookie-lose Umgebungen)", () => {
    make({ getToken: () => "tok-123" }).start();
    FakeSocket.instances[0]!.open();
    expect(JSON.parse(FakeSocket.instances[0]!.sent[0]!)).toEqual({ type: "auth", token: "tok-123" });
  });

  it("ohne Token wird keine Auth-Nachricht gesendet (Cookie)", () => {
    make().start();
    FakeSocket.instances[0]!.open();
    expect(FakeSocket.instances[0]!.sent).toEqual([]);
  });

  it("Themen: Abo wird gesendet, bei Wiederverbindung erneuert, Abbestellen zählt Referenzen", async () => {
    make().start();
    const ws = FakeSocket.instances[0]!;
    ws.open(); ws.message({ type: "hello", connId: "c1" });
    const off1 = client.subscribe("thread:a");
    const off2 = client.subscribe("thread:a");
    expect(ws.sent.filter((m) => m.includes('"subscribe"'))).toHaveLength(1);
    off1();
    expect(ws.sent.some((m) => m.includes("unsubscribe"))).toBe(false);
    ws.drop();
    await vi.advanceTimersByTimeAsync(1500);
    const ws2 = FakeSocket.instances[1]!;
    ws2.open(); ws2.message({ type: "hello", connId: "c2" });
    expect(ws2.sent.some((m) => m.includes('"subscribe"') && m.includes("thread:a"))).toBe(true);
    off2();
    expect(ws2.sent.some((m) => m.includes("unsubscribe"))).toBe(true);
  });

  it("Wiederverbindung nach Abbruch meldet resync (nicht beim ersten Verbinden)", async () => {
    make().start();
    const ws = FakeSocket.instances[0]!;
    ws.open(); ws.message({ type: "hello", connId: "c1" });
    expect(events.some((e) => e.type === "resync")).toBe(false);
    ws.drop();
    await vi.advanceTimersByTimeAsync(1500);
    FakeSocket.instances[1]!.open(); FakeSocket.instances[1]!.message({ type: "hello", connId: "c2" });
    expect(events.filter((e) => e.type === "resync")).toHaveLength(1);
  });

  it("Rückfall WebSocket → SSE nach zwei Fehlversuchen, SSE liefert Ereignisse", async () => {
    make().start();
    FakeSocket.instances[0]!.drop(1006); // 1. Fehlversuch
    await vi.advanceTimersByTimeAsync(1500);
    FakeSocket.instances[1]!.drop(1006); // 2. → Stufe wechseln (sofort)
    await vi.advanceTimersByTimeAsync(10);
    await flush();
    expect(sse.calls.some((c) => c.url === "/api/realtime/stream")).toBe(true);
    sse.streams[0]!.push({ type: "hello", connId: "s1", transport: "sse" });
    await flush();
    expect(client.getStatus()).toBe("sse");
    sse.streams[0]!.push({ type: "notification", id: "n1" });
    await flush();
    expect(events).toContainEqual({ type: "notification", id: "n1" });
  });

  it("kein WebSocket vorhanden → direkt SSE; Token geht als Header, Befehle über POST /realtime/command", async () => {
    vi.stubGlobal("WebSocket", undefined);
    make({ getToken: () => "tok" }).start();
    await flush();
    expect(sse.streams[0]!.init.headers).toMatchObject({ "X-Session-Token": "tok" });
    sse.streams[0]!.push({ type: "hello", connId: "s1", transport: "sse" });
    await flush();
    client.typing("11111111-1111-4111-8111-111111111111");
    await flush();
    const cmd = sse.calls.find((c) => c.url === "/api/realtime/command")!;
    expect(JSON.parse(String(cmd.init.body))).toEqual({ connId: "s1", message: { type: "typing", conversationId: "11111111-1111-4111-8111-111111111111" } });
    expect(cmd.init.headers).toMatchObject({ "X-Session-Token": "tok" });
  });

  it("Konstruktor-Fehler (WebSocket gesperrt) fällt ebenfalls zurück", async () => {
    FakeSocket.throwOnConstruct = true;
    make().start();
    await vi.advanceTimersByTimeAsync(1500);
    await flush();
    expect(sse.calls.length).toBeGreaterThan(0);
  });

  it("SSE 401 → keine Endlosschleife (Status offline)", async () => {
    vi.stubGlobal("WebSocket", undefined);
    const fetch401 = vi.fn(async () => new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetch401);
    make().start();
    await flush();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetch401).toHaveBeenCalledTimes(1);
    expect(client.getStatus()).toBe("offline");
  });

  it("wiederholte SSE-Fehler → Polling-Status, danach weiterhin Wiederverbindungsversuche", async () => {
    vi.stubGlobal("WebSocket", undefined);
    const failing = vi.fn(async () => { throw new TypeError("netz"); });
    vi.stubGlobal("fetch", failing);
    make().start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(statuses).toContain("polling");
    expect(client.getStatus()).toBe("polling");
    const before = failing.mock.calls.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(failing.mock.calls.length).toBeGreaterThan(before);
  });

  it("Stille über 75 s → Verbindung wird neu aufgebaut", async () => {
    make().start();
    const ws = FakeSocket.instances[0]!;
    ws.open(); ws.message({ type: "hello", connId: "c1" });
    await vi.advanceTimersByTimeAsync(31_000);
    expect(ws.sent.some((m) => m.includes('"ping"'))).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(FakeSocket.instances.length).toBeGreaterThan(1);
  });

  it("4401 nach stehender Verbindung (Sitzung beendet) → offline, kein Neuaufbau", async () => {
    make().start();
    const ws = FakeSocket.instances[0]!;
    ws.open(); ws.message({ type: "hello", connId: "c1" });
    ws.drop(4401);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(client.getStatus()).toBe("offline");
  });

  it("stop() beendet alles und verhindert Neuaufbau", async () => {
    make().start();
    const ws = FakeSocket.instances[0]!;
    ws.open(); ws.message({ type: "hello", connId: "c1" });
    client.stop();
    ws.drop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(client.getStatus()).toBe("offline");
  });
});

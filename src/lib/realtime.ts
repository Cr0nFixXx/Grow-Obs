/**
 * Echtzeit-Client (B-59), unabhängig von React.
 *
 * Reihenfolge: WebSocket → Server-Sent Events → Polling. Fällt eine Stufe aus (Proxy, `next dev`, Serverless), geht es
 * automatisch eine Stufe tiefer; Wiederverbindung mit Backoff + Jitter, Pause bei langer Inaktivität des Tabs, Neuaufbau
 * bei Netzwechsel. Ereignisse sind klein (IDs); Inhalte laden die Aufrufer über die normale REST-API nach.
 */
export type RealtimeStatus = "connecting" | "ws" | "sse" | "polling" | "offline";
export type RealtimeEvent = { type: string } & Record<string, unknown>;

export interface RealtimeClientOptions {
  /** API-Basis wie `config.apiBaseUrl` (z. B. "/api" oder "https://api.example.com"). */
  baseUrl: string;
  /** Token nur im Header-Fallback-Modus (Sandbox-Vorschau); sonst `null` → Cookie. */
  getToken: () => string | null;
  onEvent: (event: RealtimeEvent) => void;
  onStatus: (status: RealtimeStatus) => void;
  /** WebSocket abschalten (Tests/Diagnose). */
  disableWebSocket?: boolean;
}

const HELLO_TIMEOUT_MS = 6000;
const WATCHDOG_MS = 30_000;
const SILENCE_LIMIT_MS = 75_000;
const HIDDEN_PAUSE_MS = 60_000;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30_000;
/** Nach so vielen Fehlversuchen einer Stufe wird die nächste probiert. */
const WS_FAILURES_BEFORE_SSE = 2;
const SSE_FAILURES_BEFORE_POLLING = 3;
const WS_RETRY_AFTER_MS = 5 * 60_000;

export function backoffDelay(attempt: number, random = Math.random): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt));
  return Math.round(base * (0.75 + random() * 0.5));
}

export function socketUrl(baseUrl: string, location: { href: string }): string {
  const url = new URL(`${baseUrl}/realtime/ws`, location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export class RealtimeClient {
  private opts: RealtimeClientOptions;
  private status: RealtimeStatus = "offline";
  private running = false;
  private paused = false;
  private ws: WebSocket | null = null;
  private abort: AbortController | null = null;
  private connId: string | null = null;
  private transport: "ws" | "sse" | null = null;
  private topics = new Map<string, number>();
  private wsFailures = 0;
  private sseFailures = 0;
  private wsBlockedUntil = 0;
  private attempt = 0;
  private connectedOnce = false;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private watchdog: ReturnType<typeof setInterval> | undefined;
  private hiddenTimer: ReturnType<typeof setTimeout> | undefined;
  private lastSeen = 0;
  private generation = 0;

  constructor(opts: RealtimeClientOptions) { this.opts = opts; }

  getStatus(): RealtimeStatus { return this.status; }

  start(): void {
    if (this.running) return;
    this.running = true;
    if (typeof window !== "undefined") {
      document.addEventListener("visibilitychange", this.onVisibility);
      window.addEventListener("online", this.onOnline);
      window.addEventListener("offline", this.onOffline);
    }
    if (typeof document !== "undefined" && document.visibilityState === "hidden") this.paused = true;
    else this.connect();
  }

  stop(): void {
    this.running = false;
    this.generation += 1;
    clearTimeout(this.retryTimer);
    clearTimeout(this.hiddenTimer);
    this.teardown();
    if (typeof window !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVisibility);
      window.removeEventListener("online", this.onOnline);
      window.removeEventListener("offline", this.onOffline);
    }
    this.setStatus("offline");
  }

  /** Thema abonnieren (z. B. `thread:<id>`); mehrfach abonnierbar, Rückgabe = abbestellen. */
  subscribe(topic: string): () => void {
    this.topics.set(topic, (this.topics.get(topic) ?? 0) + 1);
    if (this.topics.get(topic) === 1) this.command({ type: "subscribe", topic });
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const n = (this.topics.get(topic) ?? 1) - 1;
      if (n <= 0) { this.topics.delete(topic); this.command({ type: "unsubscribe", topic }); } else this.topics.set(topic, n);
    };
  }

  /** „schreibt …“ melden. */
  typing(conversationId: string): void { this.command({ type: "typing", conversationId }); }

  /* ----------------------------- intern ----------------------------- */
  private setStatus(status: RealtimeStatus) {
    if (status === this.status) return;
    this.status = status;
    this.opts.onStatus(status);
  }

  private command(message: Record<string, unknown>): void {
    if (this.transport === "ws" && this.ws?.readyState === 1) { this.ws.send(JSON.stringify(message)); return; }
    if (this.transport === "sse" && this.connId) {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const token = this.opts.getToken();
      if (token) headers["X-Session-Token"] = token;
      void fetch(`${this.opts.baseUrl}/realtime/command`, { method: "POST", headers, credentials: "include", body: JSON.stringify({ connId: this.connId, message }) }).catch(() => undefined);
    }
  }

  private teardown() {
    clearInterval(this.watchdog);
    this.abort?.abort();
    this.abort = null;
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try { ws.close(); } catch { /* bereits zu */ }
    }
    this.connId = null;
    this.transport = null;
  }

  private connect() {
    if (!this.running || this.paused) return;
    clearTimeout(this.retryTimer);
    this.teardown();
    const generation = ++this.generation;
    if (this.status !== "polling") this.setStatus("connecting");
    const canWs = !this.opts.disableWebSocket && typeof WebSocket !== "undefined" && (this.wsFailures < WS_FAILURES_BEFORE_SSE || Date.now() >= this.wsBlockedUntil);
    if (canWs && this.wsFailures >= WS_FAILURES_BEFORE_SSE) this.wsFailures = 0; // Sperre abgelaufen → erneut probieren
    if (canWs && this.wsFailures < WS_FAILURES_BEFORE_SSE) this.openWebSocket(generation);
    else void this.openStream(generation);
  }

  private opened(transport: "ws" | "sse", generation: number) {
    if (generation !== this.generation) return;
    this.transport = transport;
    this.attempt = 0;
    this.lastSeen = Date.now();
    if (transport === "ws") this.wsFailures = 0; else this.sseFailures = 0;
    this.setStatus(transport);
    for (const topic of this.topics.keys()) this.command({ type: "subscribe", topic });
    // Nach einer Wiederverbindung können Ereignisse fehlen → Verbraucher laden neu.
    if (this.connectedOnce) this.opts.onEvent({ type: "resync" });
    this.connectedOnce = true;
    clearInterval(this.watchdog);
    this.watchdog = setInterval(() => {
      if (Date.now() - this.lastSeen > SILENCE_LIMIT_MS) { this.failed(transport, generation, true); return; }
      if (transport === "ws") this.command({ type: "ping" });
    }, WATCHDOG_MS);
  }

  private handle(raw: string) {
    this.lastSeen = Date.now();
    let event: RealtimeEvent;
    try { event = JSON.parse(raw) as RealtimeEvent; } catch { return; }
    if (!event || typeof event.type !== "string") return;
    if (event.type === "hello") { if (typeof event.connId === "string") this.connId = event.connId; return; }
    if (event.type === "pong") return;
    this.opts.onEvent(event);
  }

  private failed(transport: "ws" | "sse", generation: number, wasOpen: boolean, fatal = false) {
    if (generation !== this.generation || !this.running) return;
    this.teardown();
    if (fatal) { this.setStatus("offline"); return; }
    if (transport === "ws") {
      if (!wasOpen && ++this.wsFailures >= WS_FAILURES_BEFORE_SSE) this.wsBlockedUntil = Date.now() + WS_RETRY_AFTER_MS;
    } else if (!wasOpen) {
      this.sseFailures += 1;
    }
    if (this.sseFailures >= SSE_FAILURES_BEFORE_POLLING) this.setStatus("polling");
    else if (this.status !== "polling") this.setStatus("connecting");
    // Beim Wechsel der Stufe sofort weiter, sonst Backoff.
    const switchTransport = transport === "ws" && this.wsFailures >= WS_FAILURES_BEFORE_SSE;
    const delay = switchTransport ? 0 : backoffDelay(this.attempt++);
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  private openWebSocket(generation: number) {
    let opened = false;
    let ws: WebSocket;
    try { ws = new WebSocket(socketUrl(this.opts.baseUrl, window.location)); } catch { this.failed("ws", generation, false); return; }
    this.ws = ws;
    const helloTimer = setTimeout(() => { if (!opened) this.failed("ws", generation, false); }, HELLO_TIMEOUT_MS);
    ws.onopen = () => {
      const token = this.opts.getToken();
      if (token) ws.send(JSON.stringify({ type: "auth", token }));
    };
    ws.onmessage = (message) => {
      if (typeof message.data !== "string") return;
      if (!opened) {
        try { if ((JSON.parse(message.data) as { type?: string }).type !== "hello") return; } catch { return; }
        opened = true;
        clearTimeout(helloTimer);
        this.transport = "ws"; // vor `opened`, damit Abos sofort gesendet werden
        this.opened("ws", generation);
      }
      this.handle(message.data);
    };
    ws.onclose = (event) => {
      clearTimeout(helloTimer);
      // 4401/4403: Sitzung ungültig bzw. Passwortwechsel offen → nicht erneut versuchen (REST-Aufrufe behandeln das).
      const rejected = event.code === 4401 || event.code === 4403;
      // Abgelehnt, bevor die Verbindung stand (z. B. kein Cookie): WebSocket aufgeben und SSE probieren (liefert dort ggf. 401).
      if (rejected && !opened) this.wsFailures = WS_FAILURES_BEFORE_SSE - 1;
      this.failed("ws", generation, opened, rejected && opened);
    };
    ws.onerror = () => undefined; // `onclose` folgt immer
  }

  private async openStream(generation: number) {
    const controller = new AbortController();
    this.abort = controller;
    let opened = false;
    try {
      const headers: Record<string, string> = { Accept: "text/event-stream" };
      const token = this.opts.getToken();
      if (token) headers["X-Session-Token"] = token;
      const res = await fetch(`${this.opts.baseUrl}/realtime/stream`, { headers, credentials: "include", cache: "no-store", signal: controller.signal });
      if (res.status === 401 || res.status === 403) { this.failed("sse", generation, false, true); return; }
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        this.lastSeen = Date.now();
        buffer += decoder.decode(value, { stream: true });
        let index: number;
        while ((index = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          const data = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
          if (!data) continue;
          if (!opened) {
            try { if ((JSON.parse(data) as { type?: string }).type !== "hello") continue; } catch { continue; }
            opened = true;
            this.handle(data); // setzt connId
            this.opened("sse", generation);
            continue;
          }
          this.handle(data);
        }
      }
      this.failed("sse", generation, opened);
    } catch {
      if (controller.signal.aborted) return;
      this.failed("sse", generation, opened);
    }
  }

  private onVisibility = () => {
    if (!this.running) return;
    if (document.visibilityState === "hidden") {
      // Lange im Hintergrund: Verbindung freigeben (spart Akku/Verbindungen, Online-Status endet nach kurzer Karenz).
      this.hiddenTimer = setTimeout(() => { this.paused = true; this.generation += 1; clearTimeout(this.retryTimer); this.teardown(); this.setStatus("offline"); }, HIDDEN_PAUSE_MS);
    } else {
      clearTimeout(this.hiddenTimer);
      if (this.paused) { this.paused = false; this.attempt = 0; this.connect(); }
    }
  };
  private onOnline = () => { if (this.running && !this.paused) { this.attempt = 0; clearTimeout(this.retryTimer); this.connect(); } };
  private onOffline = () => { if (this.running) this.setStatus("offline"); };
}

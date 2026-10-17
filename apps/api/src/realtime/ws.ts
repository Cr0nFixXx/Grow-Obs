import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { corsOrigins } from "../env.ts";
import { authenticateToken, headerSessionEnabled, SESSION_COOKIE, type ActiveSession } from "../lib/session.ts";
import { clientMessageSchema, handleClientMessage } from "./commands.ts";
import { newConnectionId, register, unregister, type Connection, type RealtimeEvent } from "./hub.ts";

/** WebSocket-Endpunkt (B-59). Pfad endet auf `/realtime/ws` (eingebettet: `/api/realtime/ws`). */
export const WS_PATH_SUFFIX = "/realtime/ws";
/** Ohne Cookie (Sandbox-Proxy) muss die erste Nachricht das Token tragen – innerhalb dieser Frist. */
export const AUTH_TIMEOUT_MS = 5000;
const MAX_BUFFERED_BYTES = 1_000_000;

const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

function cookieToken(header: string | undefined): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) { try { return decodeURIComponent(rest.join("=")); } catch { return undefined; } }
  }
  return undefined;
}

/** Browser-Anfragen müssen vom gleichen Host oder einem erlaubten Origin kommen (Schutz vor Cross-Site-WebSocket-Hijacking). */
export function originAllowed(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // Nicht-Browser-Clients
  if (corsOrigins.includes(origin)) return true;
  const forwarded = String(req.headers["x-forwarded-host"] ?? "").split(",")[0]?.trim();
  const host = forwarded || req.headers.host;
  try { return new URL(origin).host === host; } catch { return false; }
}

function reject(socket: Duplex, status: string) {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

/** Behandelt einen HTTP-Upgrade. Gibt `false` zurück, wenn der Pfad nicht zu diesem Endpunkt gehört. */
export function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean {
  let pathname: string;
  try { pathname = new URL(req.url ?? "/", "http://localhost").pathname; } catch { return false; }
  if (!pathname.endsWith(WS_PATH_SUFFIX)) return false;
  if (!originAllowed(req)) { reject(socket, "403 Forbidden"); return true; }
  wss.handleUpgrade(req, socket, head, (ws) => { void onConnection(ws, req); });
  return true;
}

async function onConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
  /** init = Cookie wird geprüft · token = wartet auf `{type:"auth"}` · ready = angemeldet · done = beendet */
  type Phase = "init" | "token" | "ready" | "done";
  let phase: Phase = "init";
  const isDone = () => phase === ("done" as Phase);
  let session: ActiveSession | null = null;
  let conn: Connection | null = null;
  let alive = true;
  const timers: { auth?: ReturnType<typeof setTimeout> } = {};
  const queue: string[] = [];
  const fail = (code: number, reason: string) => { try { ws.close(code, reason); } catch { /* bereits zu */ } };

  const onMessage = async (raw: string) => {
    let data: unknown;
    try { data = JSON.parse(raw); } catch { return; }
    const parsed = clientMessageSchema.safeParse(data);
    if (parsed.success && session && conn) await handleClientMessage(session.userId, parsed.data, conn).catch(() => undefined);
  };

  const start = async (active: ActiveSession) => {
    if (isDone()) return;
    if (active.mustChangePassword) return fail(4403, "Passwortwechsel erforderlich");
    session = active;
    const connection: Connection = {
      id: newConnectionId(), userId: active.userId, sessionId: active.sessionId, transport: "ws", topics: new Set(),
      send(event: RealtimeEvent) {
        if (ws.readyState !== WebSocket.OPEN) return;
        if (ws.bufferedAmount > MAX_BUFFERED_BYTES) { ws.terminate(); return; }
        ws.send(JSON.stringify(event));
      },
      keepAlive() { if (!alive) { ws.terminate(); return; } alive = false; try { ws.ping(); } catch { /* ignorieren */ } },
      close: (code, reason) => fail(code, reason),
    };
    try { await register(connection); } catch { return fail(1011, "Echtzeit nicht verfügbar"); }
    if (isDone()) { unregister(connection); return; }
    conn = connection;
    phase = "ready";
    connection.send({ type: "hello", connId: connection.id, transport: "ws" });
    for (const raw of queue.splice(0)) void onMessage(raw);
  };

  /** Token als erste Nachricht (nur mit ALLOW_HEADER_SESSION, z. B. Sandbox-Vorschau, die kein Cookie durchreicht). */
  const receiveToken = (raw: string) => {
    let message: { type?: unknown; token?: unknown } = {};
    try { message = JSON.parse(raw) as typeof message; } catch { /* unten abgelehnt */ }
    if (message.type !== "auth" || typeof message.token !== "string") return fail(4401, "Anmeldung erforderlich");
    phase = "init";
    clearTimeout(timers.auth);
    void authenticateToken(message.token).then((active) => (active ? start(active) : fail(4401, "Anmeldung erforderlich")), () => fail(1011, "Fehler"));
  };

  // Handler sofort anhängen: Nachrichten, die während der Cookie-Prüfung eintreffen, gehen sonst verloren.
  ws.on("message", (data, isBinary) => {
    if (isBinary) return;
    const raw = data.toString();
    if (phase === "ready") void onMessage(raw);
    else if (phase === "token") receiveToken(raw);
    else if (phase === "init" && queue.length < 20) queue.push(raw);
  });
  ws.on("pong", () => { alive = true; });
  ws.on("close", () => { phase = "done"; clearTimeout(timers.auth); if (conn) unregister(conn); });
  ws.on("error", () => ws.terminate());

  const fromCookie = await authenticateToken(cookieToken(req.headers.cookie)).catch(() => null);
  if (isDone()) return;
  if (fromCookie) { await start(fromCookie); return; }
  if (!headerSessionEnabled()) return fail(4401, "Anmeldung erforderlich");
  phase = "token";
  timers.auth = setTimeout(() => { if (phase === "token") fail(4401, "Anmeldung erforderlich"); }, AUTH_TIMEOUT_MS);
  const first = queue.shift();
  if (first !== undefined) receiveToken(first);
}

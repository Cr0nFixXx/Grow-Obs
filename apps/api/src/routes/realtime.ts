import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, type AuthEnv } from "../middleware/auth.ts";
import { rateLimit, userKey } from "../middleware/rate-limit.ts";
import { clientMessageSchema, handleClientMessage } from "../realtime/commands.ts";
import "../realtime/index.ts";
import { newConnectionId, register, unregister, type Connection, type RealtimeEvent } from "../realtime/hub.ts";

/**
 * Echtzeit über Server-Sent Events (B-59) – Rückfall, wenn WebSocket nicht möglich ist (Proxy, `next dev`).
 * `GET /realtime/stream`: Ereignisstrom (Auth wie überall: Cookie bzw. Header-Token).
 * `POST /realtime/command`: Client → Server (Themen abonnieren, „schreibt …“).
 */
export const realtimeApi = new Hono<AuthEnv>();
realtimeApi.use("*", requireAuth);

const encoder = new TextEncoder();

realtimeApi.get("/stream", rateLimit({ name: "rt-stream", limit: 60, windowMs: 60_000, keys: userKey }), async (c) => {
  const userId = c.get("userId");
  const sessionId = c.get("sessionId");
  let connection: Connection | null = null;
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;
  const finish = () => {
    if (closed) return;
    closed = true;
    if (connection) unregister(connection);
    try { controller.close(); } catch { /* bereits geschlossen */ }
  };
  const write = (chunk: string) => { if (!closed) { try { controller.enqueue(encoder.encode(chunk)); } catch { finish(); } } };

  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      controller = ctrl;
      const conn: Connection = {
        id: newConnectionId(), userId, sessionId, transport: "sse", topics: new Set(),
        send: (event: RealtimeEvent) => write(`data: ${JSON.stringify(event)}\n\n`),
        keepAlive: () => write(": ping\n\n"),
        close: () => finish(),
      };
      try { await register(conn); } catch { write(`data: ${JSON.stringify({ type: "error" })}\n\n`); finish(); return; }
      if (closed) { unregister(conn); return; }
      connection = conn;
      write("retry: 3000\n\n");
      conn.send({ type: "hello", connId: conn.id, transport: "sse" });
    },
    cancel() { finish(); },
  });
  c.req.raw.signal?.addEventListener("abort", finish, { once: true });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no", Connection: "keep-alive" },
  });
});

const commandSchema = z.object({ connId: z.string().uuid().optional(), message: clientMessageSchema });
realtimeApi.post("/command", rateLimit({ name: "rt-command", limit: 240, windowMs: 60_000, keys: userKey }), async (c) => {
  const parsed = commandSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Ungültige Daten" }, 400);
  await handleClientMessage(c.get("userId"), parsed.data.message, undefined, parsed.data.connId);
  return c.body(null, 204);
});

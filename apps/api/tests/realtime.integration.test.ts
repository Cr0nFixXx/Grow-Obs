import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import WebSocket from "ws";
import { app } from "../src/app.ts";
import { client, db } from "../src/db/client.ts";
import { notifications, sessions, subs, threads, users } from "../src/db/schema.ts";
import { signToken } from "../src/lib/jwt.ts";
import { hashPassword } from "../src/lib/password.ts";
import { SESSION_COOKIE } from "../src/lib/session.ts";
import { resetRateLimits } from "../src/middleware/rate-limit.ts";
import { resetTypingThrottle } from "../src/realtime/commands.ts";
import { heartbeatOnce, publish, shutdownRealtime, connectionCount } from "../src/realtime/hub.ts";
import { handleUpgrade } from "../src/realtime/index.ts";

interface Person { id: string; cookie: string; token: string; sessionId: string }
async function person(name: string, extra: Partial<typeof users.$inferInsert> = {}): Promise<Person> {
  const [u] = await db.insert(users).values({ name, email: `${name.toLowerCase()}@example.test`, handle: name.toLowerCase(), passwordHash: await hashPassword("test-password-long-enough"), ...extra }).returning();
  const expiresAt = new Date(Date.now() + 3600_000);
  const [s] = await db.insert(sessions).values({ userId: u!.id, expiresAt }).returning();
  const token = await signToken({ sub: u!.id, role: u!.role, sid: s!.id }, expiresAt);
  return { id: u!.id, cookie: `${SESSION_COOKIE}=${token}`, token, sessionId: s!.id };
}
type Init = { method?: string; data?: unknown; headers?: Record<string, string>; signal?: AbortSignal };
const call = (p: Person | null, path: string, { method = "GET", data, headers = {}, signal }: Init = {}) =>
  app.request(path, { method, signal, headers: { ...(p ? { Cookie: p.cookie } : {}), ...(data === undefined ? {} : { "Content-Type": "application/json" }), ...headers }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
const json = async <T = any>(res: Response) => (await res.json()) as T;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(fn: () => T | undefined | Promise<T | undefined>, ms = 3000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > end) throw new Error("until: Zeitüberschreitung");
    await sleep(20);
  }
}

/** Sammelt alle Ereignisse einer WebSocket-/SSE-Verbindung. */
class Inbox {
  events: any[] = [];
  find = (type: string, match: (e: any) => boolean = () => true) => this.events.find((e) => e.type === type && match(e));
  wait = (type: string, match?: (e: any) => boolean, ms = 3000) => until(() => this.find(type, match), ms);
}
async function openSse(p: Person, controller = new AbortController()) {
  const res = await call(p, "/realtime/stream", { signal: controller.signal });
  expect(res.status).toBe(200);
  const inbox = new Inbox();
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        let i: number;
        while ((i = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, i); buffer = buffer.slice(i + 2);
          for (const line of block.split("\n")) if (line.startsWith("data: ")) inbox.events.push(JSON.parse(line.slice(6)));
        }
      }
    } catch { /* abgebrochen */ }
  })();
  const hello = await inbox.wait("hello");
  return { inbox, res, connId: hello.connId as string, close: () => { controller.abort(); void reader.cancel().catch(() => undefined); } };
}

let server: Server;
let wsUrl: string;
async function openWs(p: Person | null, opts: { origin?: string; authMessage?: string } = {}) {
  const ws = new WebSocket(wsUrl, { headers: { ...(p ? { cookie: p.cookie } : {}), ...(opts.origin ? { origin: opts.origin } : {}) } });
  const inbox = new Inbox();
  let closeCode: number | null = null;
  let status: number | null = null;
  ws.on("message", (d) => inbox.events.push(JSON.parse(d.toString())));
  ws.on("close", (code) => { closeCode = code; });
  ws.on("unexpected-response", (_req, res) => { status = res.statusCode ?? null; });
  ws.on("error", () => undefined);
  if (opts.authMessage) ws.on("open", () => ws.send(JSON.stringify({ type: "auth", token: opts.authMessage })));
  return { ws, inbox, closeCode: () => closeCode, status: () => status, send: (m: unknown) => ws.send(JSON.stringify(m)) };
}

beforeAll(async () => {
  const name = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  if (process.env.NODE_ENV !== "test" || !name.endsWith("_test")) throw new Error("Integration tests require a dedicated *_test database");
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  server = createServer();
  server.on("upgrade", (req, socket, head) => { if (!handleUpgrade(req, socket, head)) socket.destroy(); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  wsUrl = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/api/realtime/ws`;
});
beforeEach(async () => {
  await resetRateLimits(); resetTypingThrottle();
  process.env.REALTIME_OFFLINE_GRACE_MS = "150";
  delete process.env.ALLOW_HEADER_SESSION;
  await db.execute(sql`TRUNCATE TABLE users CASCADE`);
});
afterEach(async () => { await shutdownRealtime(); });
afterAll(async () => { await shutdownRealtime(); await new Promise((r) => server.close(r)); await client.end({ timeout: 5 }); });

describe("Hub (LISTEN/NOTIFY)", () => {
  it("stellt Ereignisse an die Verbindungen des Zielnutzers zu – nicht an andere", async () => {
    const [a, b] = [await person("Anna"), await person("Bernd")];
    const sa = await openSse(a); const sb = await openSse(b);
    await publish({ users: [a.id] }, { type: "ping-test", n: 1 });
    await sa.inbox.wait("ping-test");
    await sleep(100);
    expect(sb.inbox.find("ping-test")).toBeUndefined();
    sa.close(); sb.close();
  });

  it("Themen: nur Abonnenten erhalten Thread-Ereignisse; ungültige Themen werden ignoriert", async () => {
    const [a, b] = [await person("Anna"), await person("Bernd")];
    const sa = await openSse(a); const sb = await openSse(b);
    const topic = "thread:11111111-1111-4111-8111-111111111111";
    expect((await call(a, "/realtime/command", { method: "POST", data: { connId: sa.connId, message: { type: "subscribe", topic } } })).status).toBe(204);
    await call(a, "/realtime/command", { method: "POST", data: { connId: sa.connId, message: { type: "subscribe", topic: "user:alle" } } });
    await sleep(150);
    await publish({ topic }, { type: "thread.comment", threadId: "x" });
    await sa.inbox.wait("thread.comment");
    await sleep(100);
    expect(sb.inbox.find("thread.comment")).toBeUndefined();
    // fremde Verbindung kann nicht über connId gekapert werden
    await call(b, "/realtime/command", { method: "POST", data: { connId: sa.connId, message: { type: "unsubscribe", topic } } });
    await sleep(150);
    await publish({ topic }, { type: "thread.comment", threadId: "y" });
    await sa.inbox.wait("thread.comment", (e) => e.threadId === "y");
    sa.close(); sb.close();
  });

  it("zu große Ereignisse werden verworfen statt NOTIFY zu sprengen", async () => {
    const a = await person("Anna");
    const s = await openSse(a);
    await publish({ users: [a.id] }, { type: "riesig", blob: "x".repeat(9000) });
    await sleep(150);
    expect(s.inbox.find("riesig")).toBeUndefined();
    s.close();
  });
});

describe("SSE-Transport", () => {
  it("verlangt eine Anmeldung und liefert hello + retry", async () => {
    expect((await call(null, "/realtime/stream")).status).toBe(401);
    const a = await person("Anna");
    const s = await openSse(a);
    expect(s.res.headers.get("content-type")).toContain("text/event-stream");
    expect(s.connId).toMatch(/^[0-9a-f-]{36}$/);
    s.close();
  });

  it("Konten mit offenem Passwortwechsel werden abgewiesen (403)", async () => {
    const a = await person("Anna", { mustChangePassword: true });
    expect((await call(a, "/realtime/stream")).status).toBe(403);
  });

  it("Forum-Kommentar: Abonnenten erhalten thread.comment, der Autor eine Benachrichtigung (live)", async () => {
    const [author, reader] = [await person("Autor"), await person("Leser")];
    const [sub] = await db.insert(subs).values({ name: "r/Realtime" }).onConflictDoUpdate({ target: subs.name, set: { name: "r/Realtime" } }).returning();
    const [thread] = await db.insert(threads).values({ subId: sub!.id, userId: author.id, title: "Hallo Welt" }).returning();
    const sAuthor = await openSse(author); const sReader = await openSse(reader);
    await call(reader, "/realtime/command", { method: "POST", data: { connId: sReader.connId, message: { type: "subscribe", topic: `thread:${thread!.id}` } } });
    await sleep(150);
    const res = await call(reader, `/forum/threads/${thread!.id}/comments`, { method: "POST", data: { text: "Gute Frage" } });
    expect(res.status).toBe(201);
    await sReader.inbox.wait("thread.comment", (e) => e.threadId === thread!.id);
    const note = await sAuthor.inbox.wait("notification");
    const rows = await db.select().from(notifications).where(eq(notifications.userId, author.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: note.id, type: "forum", title: "Neue Antwort im Forum", body: "Hallo Welt" });
    // Eigener Kommentar im eigenen Thread → keine Benachrichtigung
    await call(author, `/forum/threads/${thread!.id}/comments`, { method: "POST", data: { text: "Danke!" } });
    expect(await db.select().from(notifications).where(eq(notifications.userId, author.id))).toHaveLength(1);
    sAuthor.close(); sReader.close();
  });

  it("Verbindungsende räumt auf", async () => {
    const a = await person("Anna");
    const s = await openSse(a);
    expect(connectionCount()).toBe(1);
    s.close();
    await until(() => (connectionCount() === 0 ? true : undefined));
  });
});

describe("WebSocket-Transport", () => {
  it("Cookie-Anmeldung → hello; Themen-Abo und Ereignisse laufen über die Verbindung", async () => {
    const a = await person("Anna");
    const c = await openWs(a);
    const hello = await c.inbox.wait("hello");
    expect(hello.transport).toBe("ws");
    const topic = "thread:22222222-2222-4222-8222-222222222222";
    c.send({ type: "subscribe", topic });
    await sleep(100);
    await publish({ topic }, { type: "thread.comment", threadId: "t" });
    await c.inbox.wait("thread.comment");
    c.send({ type: "ping" });
    await c.inbox.wait("pong");
    c.ws.close();
  });

  it("ohne Anmeldung schließt der Server mit 4401", async () => {
    const c = await openWs(null);
    await until(() => c.closeCode() ?? undefined);
    expect(c.closeCode()).toBe(4401);
  });

  it("fremder Origin wird abgewiesen (403), erlaubter/gleicher Host nicht", async () => {
    const a = await person("Anna");
    const bad = await openWs(a, { origin: "https://evil.example" });
    await until(() => bad.status() ?? undefined);
    expect(bad.status()).toBe(403);
    const same = await openWs(a, { origin: new URL(wsUrl).origin.replace("ws:", "http:") });
    await same.inbox.wait("hello");
    same.ws.close();
  });

  it("Token als erste Nachricht nur mit ALLOW_HEADER_SESSION", async () => {
    const a = await person("Anna");
    const off = await openWs(null, { authMessage: a.token });
    await until(() => off.closeCode() ?? undefined);
    expect(off.closeCode()).toBe(4401);

    process.env.ALLOW_HEADER_SESSION = "true";
    const on = await openWs(null, { authMessage: a.token });
    await on.inbox.wait("hello");
    const wrong = await openWs(null, { authMessage: "kaputt" });
    await until(() => wrong.closeCode() ?? undefined);
    expect(wrong.closeCode()).toBe(4401);
    on.ws.close();
  });

  it("beendete Sitzung → Verbindung wird beim nächsten Herzschlag getrennt (4401)", async () => {
    const a = await person("Anna");
    const c = await openWs(a);
    await c.inbox.wait("hello");
    await db.delete(sessions).where(eq(sessions.id, a.sessionId));
    await heartbeatOnce();
    await until(() => c.closeCode() ?? undefined);
    expect(c.closeCode()).toBe(4401);
  });

  it("höchstens 5 gleichzeitige Verbindungen je Konto (die älteste weicht)", async () => {
    const a = await person("Anna");
    const conns: Awaited<ReturnType<typeof openWs>>[] = [];
    for (let i = 0; i < 6; i++) { const c = await openWs(a); await c.inbox.wait("hello"); conns.push(c); }
    await until(() => conns[0]!.closeCode() ?? undefined);
    expect(conns[0]!.closeCode()).toBe(4008);
    expect(connectionCount()).toBe(5);
    conns.forEach((c) => c.ws.close());
  });
});

describe("Chat", () => {
  it("Personensuche: ≥ 2 Zeichen, ohne mich selbst, Wildcards wörtlich, Limit 10", async () => {
    const [a] = [await person("Anna"), await person("Annika"), await person("Bernd")];
    expect(await json(await call(a, "/chat/users?q=a"))).toEqual([]);
    const hits = await json<{ name: string }[]>(await call(a, "/chat/users?q=ann"));
    expect(hits.map((h) => h.name)).toEqual(["Annika"]);
    expect(await json(await call(a, "/chat/users?q=%25%25"))).toEqual([]);
    expect((await call(null, "/chat/users?q=ann")).status).toBe(401);
  });

  it("Direktnachricht: idempotent, ein Chat je Paar (beide Richtungen), nicht mit sich selbst", async () => {
    const [a, b] = [await person("Anna"), await person("Bernd")];
    const first = await call(a, "/chat", { method: "POST", data: { userId: b.id } });
    expect(first.status).toBe(201);
    const conv = await json(first);
    expect(conv).toMatchObject({ name: "Bernd", isGroup: false, partnerId: b.id, unread: 0 });
    const again = await call(a, "/chat", { method: "POST", data: { userId: b.id } });
    expect(again.status).toBe(200);
    expect((await json(again)).id).toBe(conv.id);
    const reverse = await call(b, "/chat", { method: "POST", data: { userId: a.id } });
    expect(reverse.status).toBe(200);
    const reverseConv = await json(reverse);
    expect(reverseConv.id).toBe(conv.id);
    expect(reverseConv.name).toBe("Anna"); // jede Seite sieht die Gegenstelle
    expect((await call(a, "/chat", { method: "POST", data: { userId: a.id } })).status).toBe(400);
    expect((await call(a, "/chat", { method: "POST", data: { userId: "11111111-1111-4111-8111-111111111111" } })).status).toBe(404);
  });

  it("leere Direktnachricht erscheint erst beim Gegenüber, wenn geschrieben wurde", async () => {
    const [a, b] = [await person("Anna"), await person("Bernd")];
    const conv = await json(await call(a, "/chat", { method: "POST", data: { userId: b.id } }));
    expect((await json<unknown[]>(await call(a, "/chat"))).length).toBe(1);
    expect((await json<unknown[]>(await call(b, "/chat"))).length).toBe(0);
    await call(a, `/chat/${conv.id}/messages`, { method: "POST", data: { text: "Hi" } });
    expect((await json<unknown[]>(await call(b, "/chat"))).length).toBe(1);
  });

  it("Nachricht: Live-Ereignis an beide, ungelesen/gelesen, Leseposition pro Mitglied", async () => {
    const [a, b, c] = [await person("Anna"), await person("Bernd"), await person("Clara")];
    const conv = await json(await call(a, "/chat", { method: "POST", data: { userId: b.id } }));
    const sb = await openSse(b);
    const res = await call(a, `/chat/${conv.id}/messages`, { method: "POST", data: { text: "Hallo Bernd" } });
    expect(res.status).toBe(201);
    const posted = await json(res);
    expect(posted).toMatchObject({ from: "me", text: "Hallo Bernd" });
    const event = await sb.inbox.wait("chat.message");
    expect(event).toMatchObject({ conversationId: conv.id, messageId: posted.id, senderId: a.id });

    expect((await json(await call(b, "/chat/unread"))).total).toBe(1);
    expect((await json(await call(a, "/chat/unread"))).total).toBe(0);
    const list = await json<any[]>(await call(b, "/chat"));
    expect(list[0]).toMatchObject({ id: conv.id, name: "Anna", last: "Hallo Bernd", unread: 1 });
    const messagesRes = await json<any[]>(await call(b, `/chat/${conv.id}/messages`));
    expect(messagesRes[0]).toMatchObject({ from: "them", text: "Hallo Bernd" });
    expect(typeof messagesRes[0].createdAt).toBe("string");

    expect((await call(b, `/chat/${conv.id}/read`, { method: "POST" })).status).toBe(204);
    expect((await json(await call(b, "/chat/unread"))).total).toBe(0);
    expect((await json<any[]>(await call(b, "/chat")))[0].unread).toBe(0);
    await sb.inbox.wait("chat.read");

    // Fremde dürfen weder lesen, schreiben, als gelesen markieren noch tippen
    expect((await call(c, `/chat/${conv.id}/messages`)).status).toBe(404);
    expect((await call(c, `/chat/${conv.id}/messages`, { method: "POST", data: { text: "x" } })).status).toBe(404);
    expect((await call(c, `/chat/${conv.id}/read`, { method: "POST" })).status).toBe(404);
    expect((await call(c, `/chat/${conv.id}/typing`, { method: "POST" })).status).toBe(404);
    sb.close();
  });

  it("Bestandsnachrichten gelten nach dem Update nicht als ungelesen (Migration setzt Leseposition)", async () => {
    const sqlText = (await import("node:fs")).readFileSync(fileURLToPath(new URL("../drizzle/0010_chat_realtime.sql", import.meta.url)), "utf8");
    expect(sqlText).toContain('"last_read_at" timestamp with time zone DEFAULT now() NOT NULL');
  });

  it("„schreibt …“: nur Mitglieder lösen es aus, die anderen sehen es, gedrosselt", async () => {
    const [a, b] = [await person("Anna"), await person("Bernd")];
    const conv = await json(await call(a, "/chat", { method: "POST", data: { userId: b.id } }));
    const wb = await openWs(b);
    await wb.inbox.wait("hello");
    const wa = await openWs(a);
    await wa.inbox.wait("hello");
    wa.send({ type: "typing", conversationId: conv.id });
    wa.send({ type: "typing", conversationId: conv.id });
    wa.send({ type: "typing", conversationId: conv.id });
    await wb.inbox.wait("chat.typing", (e) => e.userId === a.id && e.conversationId === conv.id);
    await sleep(200);
    expect(wb.inbox.events.filter((e) => e.type === "chat.typing")).toHaveLength(1); // Drossel: 1 je 2 s
    expect(wa.inbox.find("chat.typing")).toBeUndefined(); // nicht an sich selbst
    wa.ws.close(); wb.ws.close();
  });

  it("Online-Status: online solange verbunden, Gegenüber erhält presence, nach Trennung offline", async () => {
    const [a, b] = [await person("Anna"), await person("Bernd")];
    const conv = await json(await call(a, "/chat", { method: "POST", data: { userId: b.id } }));
    await call(a, `/chat/${conv.id}/messages`, { method: "POST", data: { text: "Hi" } }); // erst jetzt sichtbar für b
    expect((await json<any[]>(await call(a, "/chat")))[0].online).toBe(false);
    const sa = await openSse(a);
    const wb = await openWs(b);
    await wb.inbox.wait("hello");
    await wb.inbox.wait("presence", (e) => e.userId === a.id && e.online === true).catch(() => undefined); // a war vor b verbunden → Ereignis kam ggf. vorher
    expect((await json<any[]>(await call(b, "/chat")))[0]).toMatchObject({ id: conv.id, online: true });
    sa.close();
    await wb.inbox.wait("presence", (e) => e.userId === a.id && e.online === false);
    expect((await json<any[]>(await call(b, "/chat")))[0].online).toBe(false);
    wb.ws.close();
  });

  it("Senden ist pro Nutzer begrenzt (429)", async () => {
    const [a, b] = [await person("Anna"), await person("Bernd")];
    const conv = await json(await call(a, "/chat", { method: "POST", data: { userId: b.id } }));
    let last = 201;
    for (let i = 0; i < 91; i++) last = (await call(a, `/chat/${conv.id}/messages`, { method: "POST", data: { text: `n${i}` } })).status;
    expect(last).toBe(429);
  });
});

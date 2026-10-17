import { randomUUID } from "node:crypto";
import { and, gt, inArray, sql } from "drizzle-orm";
import { client, db } from "../db/client.ts";
import { sessions, users } from "../db/schema.ts";

/**
 * Echtzeit-Hub (B-59), unabhängig vom Transport (WebSocket oder SSE).
 *
 * - Ereignisse laufen über PostgreSQL `LISTEN/NOTIFY`: jede API-Instanz hört auf den Kanal und stellt die Ereignisse
 *   an ihre eigenen Verbindungen zu → funktioniert mit mehreren Instanzen ohne Redis.
 * - Zustellung an Nutzer (`users`) oder an ein Thema (`topic`, z. B. `thread:<id>`).
 * - Der Zustand liegt an `globalThis`, damit mehrfach geladene Modulkopien (Next-Bundles, HMR) denselben Hub teilen.
 * - Ereignisse sind bewusst klein (nur IDs); der Client lädt Inhalte über die normale, autorisierte REST-API nach.
 */
export type RealtimeEvent = { type: string } & Record<string, unknown>;

export interface Connection {
  readonly id: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly transport: "ws" | "sse";
  readonly topics: Set<string>;
  /** Sendet ein Ereignis an den Client (wirft nie). */
  send(event: RealtimeEvent): void;
  /** Hält die Verbindung am Leben (Kommentar-Zeile bzw. WebSocket-Ping). */
  keepAlive(): void;
  close(code: number, reason: string): void;
}

interface Envelope {
  /** Zielnutzer. */
  users?: string[];
  /** Ziel-Thema. */
  topic?: string;
  /** Steuerbefehl für genau eine Verbindung (Themen abonnieren, die auf einer anderen Instanz liegt). */
  ctl?: { connId: string; userId: string; op: "subscribe" | "unsubscribe"; topic: string };
  event?: RealtimeEvent;
}

interface HubState {
  conns: Map<string, Connection>;
  byUser: Map<string, Set<string>>;
  graceTimers: Map<string, ReturnType<typeof setTimeout>>;
  listening: Promise<void> | null;
  unlisten: (() => Promise<void>) | null;
  heartbeat: ReturnType<typeof setInterval> | null;
  firstListen: boolean;
}

const KEY = "__growRealtimeHub";
const g = globalThis as unknown as Record<string, HubState | undefined>;
const state: HubState = (g[KEY] ??= { conns: new Map(), byUser: new Map(), graceTimers: new Map(), listening: null, unlisten: null, heartbeat: null, firstListen: true });

export const CHANNEL = "go_realtime";
export const MAX_CONNECTIONS_PER_USER = 5;
export const MAX_TOPICS_PER_CONNECTION = 20;
export const HEARTBEAT_MS = 25_000;
/** Online-Fenster: Herzschlag alle ~25 s verlängert um 70 s. */
export const ONLINE_WINDOW_MS = 70_000;
/** Kurze Karenz beim Trennen (Seitenwechsel, Netzwechsel), bevor „offline“ gemeldet wird. */
export const OFFLINE_GRACE_MS = 8_000;
const offlineGraceMs = () => Number(process.env.REALTIME_OFFLINE_GRACE_MS ?? OFFLINE_GRACE_MS);
/** NOTIFY erlaubt < 8000 Byte. */
const MAX_PAYLOAD = 7500;

const TOPIC_PATTERN = /^thread:[0-9a-f-]{36}$/i;
export const isValidTopic = (topic: unknown): topic is string => typeof topic === "string" && TOPIC_PATTERN.test(topic);

/* ----------------------------- Zustellung (lokal) ----------------------------- */
function deliverLocal(envelope: Envelope): void {
  if (envelope.ctl) {
    const conn = state.conns.get(envelope.ctl.connId);
    if (conn && conn.userId === envelope.ctl.userId) applyTopic(conn, envelope.ctl.op, envelope.ctl.topic);
    return;
  }
  const { event } = envelope;
  if (!event) return;
  const targets = new Set<Connection>();
  for (const userId of envelope.users ?? []) {
    for (const id of state.byUser.get(userId) ?? []) { const conn = state.conns.get(id); if (conn) targets.add(conn); }
  }
  if (envelope.topic) {
    for (const conn of state.conns.values()) if (conn.topics.has(envelope.topic)) targets.add(conn);
  }
  for (const conn of targets) conn.send(event);
}

export function applyTopic(conn: Connection, op: "subscribe" | "unsubscribe", topic: string): void {
  if (!isValidTopic(topic)) return;
  if (op === "unsubscribe") { conn.topics.delete(topic); return; }
  if (conn.topics.size < MAX_TOPICS_PER_CONNECTION) conn.topics.add(topic);
}

function onNotify(payload: string): void {
  try { deliverLocal(JSON.parse(payload) as Envelope); } catch { /* defektes Ereignis ignorieren */ }
}

/* ----------------------------- Senden (alle Instanzen) ----------------------------- */
async function send(envelope: Envelope): Promise<void> {
  const payload = JSON.stringify(envelope);
  if (Buffer.byteLength(payload) > MAX_PAYLOAD) {
    console.error(JSON.stringify({ event: "realtime_payload_too_large", type: envelope.event?.type }));
    return;
  }
  await client.notify(CHANNEL, payload);
}

/**
 * Sendet ein Ereignis an Nutzer und/oder ein Thema. Fehler brechen den auslösenden Request nie ab
 * (Echtzeit ist ein Zusatz, die Daten sind bereits gespeichert).
 */
export async function publish(target: { users?: string[]; topic?: string }, event: RealtimeEvent): Promise<void> {
  const users = target.users ? [...new Set(target.users)] : undefined;
  if (!users?.length && !target.topic) return;
  try { await send({ users, topic: target.topic, event }); }
  catch (error) { console.error(JSON.stringify({ event: "realtime_publish_failed", type: event.type, message: error instanceof Error ? error.message.slice(0, 120) : "unknown" })); }
}

/** Themen-Abo auf eine (womöglich fremde) Instanz zustellen. */
export async function publishControl(ctl: NonNullable<Envelope["ctl"]>): Promise<void> {
  await send({ ctl });
}

/* ----------------------------- Verbindungen ----------------------------- */
export const connectionsOf = (userId: string): Connection[] =>
  [...(state.byUser.get(userId) ?? [])].map((id) => state.conns.get(id)).filter((c): c is Connection => !!c);
export const connectionCount = () => state.conns.size;
export const isLocallyConnected = (userId: string) => (state.byUser.get(userId)?.size ?? 0) > 0;

export function newConnectionId(): string { return randomUUID(); }

export async function register(conn: Connection): Promise<void> {
  await ensureListening();
  // Pro Konto höchstens N gleichzeitige Verbindungen; die älteste weicht.
  const existing = connectionsOf(conn.userId);
  if (existing.length >= MAX_CONNECTIONS_PER_USER) existing[0]!.close(4008, "Zu viele Verbindungen");
  state.conns.set(conn.id, conn);
  let ids = state.byUser.get(conn.userId);
  if (!ids) state.byUser.set(conn.userId, (ids = new Set()));
  ids.add(conn.id);
  const timer = state.graceTimers.get(conn.userId);
  if (timer) { clearTimeout(timer); state.graceTimers.delete(conn.userId); }
  await touchPresence(conn.userId).catch(() => undefined);
}

export function unregister(conn: Connection): void {
  if (state.conns.get(conn.id) !== conn) return;
  state.conns.delete(conn.id);
  const ids = state.byUser.get(conn.userId);
  ids?.delete(conn.id);
  if (ids && ids.size === 0) {
    state.byUser.delete(conn.userId);
    // Karenz, dann offline melden – nur wenn der Nutzer nicht inzwischen (auch hier) wieder verbunden ist.
    const timer = setTimeout(() => {
      state.graceTimers.delete(conn.userId);
      if (!isLocallyConnected(conn.userId)) void goOffline(conn.userId);
    }, offlineGraceMs());
    timer.unref?.();
    state.graceTimers.set(conn.userId, timer);
  }
}

/* ----------------------------- Online-Status ----------------------------- */
async function peersOf(userId: string): Promise<string[]> {
  const rows = await db.execute<{ user_id: string }>(sql`
    SELECT DISTINCT cm2.user_id FROM conversation_members cm1
    JOIN conversation_members cm2 ON cm1.conversation_id = cm2.conversation_id
    WHERE cm1.user_id = ${userId} AND cm2.user_id <> ${userId} LIMIT 500`);
  return rows.map((r) => r.user_id);
}

async function announcePresence(userId: string, online: boolean): Promise<void> {
  const users = await peersOf(userId);
  await publish({ users }, { type: "presence", userId, online });
}

/** Verlängert das Online-Fenster; meldet „online“, wenn der Nutzer zuvor offline war. */
export async function touchPresence(userId: string): Promise<void> {
  const rows = await db.execute<{ prev: Date | null }>(sql`
    UPDATE users u SET online_until = now() + ${`${ONLINE_WINDOW_MS} milliseconds`}::interval
    FROM (SELECT online_until AS prev FROM users WHERE id = ${userId}) p WHERE u.id = ${userId} RETURNING p.prev`);
  const prev = rows[0]?.prev;
  if (rows.length && (!prev || new Date(prev).getTime() <= Date.now())) await announcePresence(userId, true);
}

async function goOffline(userId: string): Promise<void> {
  try {
    await db.execute(sql`UPDATE users SET online_until = now() WHERE id = ${userId}`);
    await announcePresence(userId, false);
  } catch { /* nächster Herzschlag bzw. Ablauf des Fensters korrigiert den Status */ }
}

/** Welche dieser Nutzer sind gerade online (für die Konversationsliste)? */
export async function onlineAmong(userIds: string[]): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const rows = await db.select({ id: users.id }).from(users).where(and(inArray(users.id, userIds), gt(users.onlineUntil, new Date())));
  return new Set(rows.map((r) => r.id));
}

/* ----------------------------- Herzschlag ----------------------------- */
/** Ein Herzschlag-Durchlauf (auch für Tests). */
export async function heartbeatOnce(): Promise<void> {
  const conns = [...state.conns.values()];
  if (!conns.length) return;
  // Widerrufene/abgelaufene Sitzungen (Abmelden, „Alle Geräte“, Passwortwechsel) trennen die Verbindung.
  const ids = [...new Set(conns.map((c) => c.sessionId))];
  const alive = new Set((await db.select({ id: sessions.id }).from(sessions).where(and(inArray(sessions.id, ids), gt(sessions.expiresAt, new Date())))).map((r) => r.id));
  for (const conn of conns) {
    if (!alive.has(conn.sessionId)) { conn.close(4401, "Sitzung beendet"); continue; }
    conn.keepAlive();
  }
  for (const userId of new Set(conns.filter((c) => alive.has(c.sessionId)).map((c) => c.userId))) await touchPresence(userId).catch(() => undefined);
}

/** Startet den Listener (einmal je Prozess) und den Herzschlag. */
export function ensureListening(): Promise<void> {
  if (!state.listening) {
    state.listening = (async () => {
      const meta = await client.listen(CHANNEL, onNotify, () => {
        // Nach einem Verbindungsabbruch können Ereignisse fehlen → Clients laden alles neu.
        if (state.firstListen) { state.firstListen = false; return; }
        for (const conn of state.conns.values()) conn.send({ type: "resync" });
      });
      state.unlisten = () => meta.unlisten();
      state.heartbeat = setInterval(() => { void heartbeatOnce().catch(() => undefined); }, HEARTBEAT_MS);
      state.heartbeat.unref?.();
    })().catch((error) => { state.listening = null; throw error; });
  }
  return state.listening;
}

/** Sauber beenden (Prozessende, Tests). */
export async function shutdownRealtime(): Promise<void> {
  if (state.heartbeat) clearInterval(state.heartbeat);
  state.heartbeat = null;
  for (const timer of state.graceTimers.values()) clearTimeout(timer);
  state.graceTimers.clear();
  for (const conn of [...state.conns.values()]) conn.close(1001, "Server beendet");
  state.conns.clear();
  state.byUser.clear();
  const unlisten = state.unlisten;
  state.unlisten = null;
  state.listening = null;
  state.firstListen = true;
  if (unlisten) await unlisten().catch(() => undefined);
}


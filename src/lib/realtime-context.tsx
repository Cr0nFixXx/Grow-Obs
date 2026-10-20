import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { config } from "./config";
import { getSessionHeaderToken } from "./api";
import { RealtimeClient, type RealtimeEvent, type RealtimeStatus } from "./realtime";

type Listener = (event: RealtimeEvent) => void;

interface RealtimeValue {
  status: RealtimeStatus;
  subscribe: (topic: string) => () => void;
  typing: (conversationId: string, topicId?: string) => void;
  on: (listener: Listener) => () => void;
}

const POLL_INTERVAL_MS = 8000;
const NOOP: RealtimeValue = { status: "offline", subscribe: () => () => undefined, typing: () => undefined, on: () => () => undefined };
export const RealtimeContext = createContext<RealtimeValue>(NOOP);

/**
 * Echtzeit-Verbindung für die angemeldete App (B-59). Mock-Modus: keine Verbindung.
 * Bei `polling` (weder WebSocket noch SSE möglich) sendet der Provider alle 8 s ein `poll`-Ereignis,
 * auf das die Datenhooks mit einem Neuladen reagieren – die App bleibt damit ohne Echtzeitkanal aktuell.
 */
export function RealtimeProvider({ children, enabled = !config.useMock }: { children: ReactNode; enabled?: boolean }) {
  const [status, setStatus] = useState<RealtimeStatus>("offline");
  const listeners = useRef(new Set<Listener>());
  // Der Client entsteht beim Rendern (ohne Nebenwirkung), damit Kinder ihre Themen schon vor dem Start anmelden können.
  const client = useMemo(() => enabled ? new RealtimeClient({
    baseUrl: config.apiBaseUrl,
    getToken: getSessionHeaderToken,
    pollingOnly: config.realtimeMode === "polling",
    onStatus: setStatus,
    onEvent: (event) => { for (const listener of [...listeners.current]) listener(event); },
  }) : null, [enabled]);

  useEffect(() => {
    client?.start();
    return () => client?.stop();
  }, [client]);

  useEffect(() => {
    if (status !== "polling") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") for (const listener of [...listeners.current]) listener({ type: "poll" });
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [status]);

  const subscribe = useCallback((topic: string) => client?.subscribe(topic) ?? (() => undefined), [client]);
  const typing = useCallback((conversationId: string, topicId?: string) => client?.typing(conversationId, topicId), [client]);
  const on = useCallback((listener: Listener) => { listeners.current.add(listener); return () => { listeners.current.delete(listener); }; }, []);
  const value = useMemo(() => ({ status, subscribe, typing, on }), [status, subscribe, typing, on]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export const useRealtime = () => useContext(RealtimeContext);

/** Reagiert auf Echtzeit-Ereignisse der angegebenen Typen (`*` = alle); `poll`/`resync` kommen bei Rückfall bzw. Wiederverbindung. */
export function useRealtimeEvent(types: string[], handler: Listener): void {
  const { on } = useRealtime();
  const ref = useRef(handler);
  ref.current = handler;
  const key = types.join("|");
  useEffect(() => on((event) => { if (types.includes("*") || types.includes(event.type)) ref.current(event); }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` bildet `types` stabil ab
    [on, key]);
}

/** Abonniert ein Thema, solange die Komponente es braucht (z. B. `thread:<id>`). */
export function useRealtimeTopic(topic: string | null): void {
  const { subscribe } = useRealtime();
  useEffect(() => (topic ? subscribe(topic) : undefined), [subscribe, topic]);
}

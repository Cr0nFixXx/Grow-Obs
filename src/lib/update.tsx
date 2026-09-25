import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useServices } from "@/data/DataContext";
import { APP_BUILD, APP_BUILT_AT } from "./app-version";
import {
  computeUpdate, parsePrefs, unseenReleases, updateAction,
  type Release, type UpdatePrefs,
} from "./update-logic";

/**
 * App-Updates (B-50).
 * Prüft `/api/version` (Next-Route, in allen Modi) + Releases beim Start, bei Sichtbarkeit/Online,
 * alle 5 Minuten und per `check()` (Pull-to-Refresh, Einstellungen). Verhalten je Nutzer-Einstellung:
 *  auto   → still neu laden, sobald die App im Hintergrund ist oder gerade gestartet wurde
 *  prompt → Banner „Update verfügbar“ (Standard)
 *  manual → nur Hinweis in Menü/Einstellungen
 * Pflicht-Updates (Admin: Release `required`) blockieren unabhängig von der Einstellung.
 */
const PREFS_KEY = "go-update-prefs";
const SEEN_KEY = "go-releases-seen-at";
const POLL_MS = 5 * 60_000;

function load<T>(key: string, parse: (v: unknown) => T, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw === null ? fallback : parse(JSON.parse(raw)); } catch { return fallback; }
}
function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
}

type CheckStatus = "idle" | "checking" | "current" | "available" | "error";

interface UpdateCtx {
  prefs: UpdatePrefs;
  setPrefs: (next: Partial<UpdatePrefs>) => void;
  status: CheckStatus;
  lastChecked: Date | null;
  available: boolean;
  mandatory: boolean;
  serverVersion: string | null;
  releases: Release[];
  latest: Release | null;
  unseen: Release[];
  /** Banner wurde für diese Sitzung verworfen („Später“). */
  snoozed: boolean;
  snooze: () => void;
  check: () => Promise<boolean>;
  apply: () => void;
  markSeen: () => void;
  whatsNewOpen: boolean;
  openWhatsNew: () => void;
  closeWhatsNew: () => void;
}

const Ctx = createContext<UpdateCtx | null>(null);

export function UpdateProvider({ children }: { children: ReactNode }) {
  const { releases: releaseService } = useServices();
  const [prefs, setPrefsState] = useState<UpdatePrefs>(() => load(PREFS_KEY, parsePrefs, parsePrefs(null)));
  const [seenAt, setSeenAt] = useState<string | null>(() => load<string | null>(SEEN_KEY, (v) => (typeof v === "string" ? v : null), null));
  const [status, setStatus] = useState<CheckStatus>("idle");
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [server, setServer] = useState<{ build: string; version: string } | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [snoozed, setSnoozed] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const startedAt = useRef(Date.now());
  const inFlight = useRef<Promise<boolean> | null>(null);

  const setPrefs = useCallback((next: Partial<UpdatePrefs>) => {
    setPrefsState((cur) => { const merged = { ...cur, ...next }; save(PREFS_KEY, merged); return merged; });
  }, []);

  const check = useCallback(() => {
    inFlight.current ??= (async () => {
      setStatus("checking");
      try {
        const [versionRes, list] = await Promise.all([
          fetch("/api/version", { cache: "no-store" }).then((r) => (r.ok ? r.json() as Promise<{ build: string; version: string }> : null)).catch(() => null),
          releaseService.list().catch(() => [] as Release[]),
        ]);
        setServer(versionRes);
        setReleases(list);
        setLastChecked(new Date());
        const { available } = computeUpdate({ clientBuild: APP_BUILD, clientBuiltAt: APP_BUILT_AT, serverBuild: versionRes?.build ?? null, releases: list });
        setStatus(versionRes ? (available ? "available" : "current") : "error");
        return available;
      } finally {
        inFlight.current = null;
      }
    })();
    return inFlight.current;
  }, [releaseService]);

  const apply = useCallback(() => {
    // Neue Version: Service Worker aktualisieren (aktiviert sich selbst), dann frisch laden.
    const reload = () => window.location.reload();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => reg?.update()).catch(() => undefined).finally(reload);
    } else reload();
  }, []);

  const markSeen = useCallback(() => {
    const newest = releases[0]?.publishedAt ?? new Date().toISOString();
    setSeenAt(newest);
    save(SEEN_KEY, newest);
  }, [releases]);

  // Erststart: aktuellen Stand als „gesehen“ merken (keine alten Notes für neue Nutzer).
  useEffect(() => {
    if (seenAt === null && lastChecked) {
      const now = releases[0]?.publishedAt ?? new Date().toISOString();
      setSeenAt(now);
      save(SEEN_KEY, now);
    }
  }, [seenAt, lastChecked, releases]);

  // Prüfen: Start, Sichtbarkeit, Online, Intervall.
  useEffect(() => {
    void check();
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    const timer = window.setInterval(onVisible, POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [check]);

  const computed = useMemo(
    () => computeUpdate({ clientBuild: APP_BUILD, clientBuiltAt: APP_BUILT_AT, serverBuild: server?.build ?? null, releases }),
    [server, releases],
  );
  const unseen = useMemo(() => unseenReleases(releases, seenAt), [releases, seenAt]);

  // Auto-Modus: still anwenden, wenn sicher (Start oder App im Hintergrund).
  useEffect(() => {
    if (!computed.available || computed.mandatory || prefs.mode !== "auto") return;
    const decide = () => updateAction("auto", { visible: document.visibilityState === "visible", justStarted: Date.now() - startedAt.current < 15_000 });
    if (decide() === "apply") { apply(); return; }
    const onHide = () => { if (document.visibilityState === "hidden") apply(); };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [computed.available, computed.mandatory, prefs.mode, apply]);

  // „Was ist neu“ automatisch zeigen (nicht während ein Update ansteht – das kommt nach dem Reload).
  useEffect(() => {
    if (prefs.showWhatsNew && unseen.length && !computed.available) setWhatsNewOpen(true);
  }, [prefs.showWhatsNew, unseen.length, computed.available]);

  const value = useMemo<UpdateCtx>(() => ({
    prefs, setPrefs, status, lastChecked,
    available: computed.available, mandatory: computed.mandatory,
    serverVersion: server?.version ?? null,
    releases, latest: releases[0] ?? null, unseen,
    snoozed, snooze: () => setSnoozed(true),
    check, apply, markSeen,
    whatsNewOpen, openWhatsNew: () => setWhatsNewOpen(true), closeWhatsNew: () => { setWhatsNewOpen(false); markSeen(); },
  }), [prefs, setPrefs, status, lastChecked, computed, server, releases, unseen, snoozed, check, apply, markSeen, whatsNewOpen]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppUpdate() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppUpdate must be used within UpdateProvider");
  return ctx;
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { defaultFeatures, featureMeta, resolveFeatureFlags, type FeatureKey } from "./features";
import { useAuth } from "@/lib/auth";
import { useServices } from "@/data/DataContext";
import { FEATURES_STALE_EVENT } from "@/lib/api";

type FlagMap = Record<FeatureKey, boolean>;

/** Letzter bekannter Server-Stand: App startet offline/sofort mit den richtigen Schaltern. */
const CACHE_KEY = "go-features-cache";
const POLL_MS = 60_000;
export const FEATURES_REFRESH_EVENT = "go:features-refresh";

function readCache(): unknown {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null"); } catch { return null; }
}
function writeCache(overrides: Record<string, boolean>) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(overrides)); } catch { /* storage blocked */ }
}

interface Ctx {
  flags: FlagMap;
  isEnabled: (key: FeatureKey) => boolean;
  setFlag: (key: FeatureKey, value: boolean) => Promise<void>;
  reset: () => Promise<void>;
  /** Server-Stand neu laden (Pull-to-Refresh, Fokus, Polling). */
  refresh: () => Promise<void>;
  /** true = Schalter wirken global für alle Nutzer. */
  global: boolean;
}

const FeatureContext = createContext<Ctx | null>(null);

/**
 * Feature-Flags (B-49): Datei-Defaults + Overrides aus dem FeatureService.
 * API-Modus: globale Overrides vom Server (gilt für alle Nutzer, auch installierte PWAs).
 * Aktualisierung: beim Start, bei App-Fokus/Sichtbarkeit, alle 60 s, bei Pull-to-Refresh und sofort,
 * wenn der Server ein deaktiviertes Feature meldet. Der Server sperrt die APIs zusätzlich selbst.
 */
export function FeatureProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { features } = useServices();
  const [flags, setFlags] = useState<FlagMap>(() => resolveFeatureFlags(features.global ? readCache() : null));
  const inFlight = useRef<Promise<void> | null>(null);

  const apply = useCallback((overrides: Record<string, boolean>) => {
    if (features.global) writeCache(overrides);
    setFlags(resolveFeatureFlags(overrides));
  }, [features.global]);

  const refresh = useCallback(() => {
    inFlight.current ??= features.get().then(apply).catch(() => { /* offline: letzter Stand bleibt */ })
      .finally(() => { inFlight.current = null; });
    return inFlight.current;
  }, [features, apply]);

  useEffect(() => {
    void refresh();
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const onRefresh = () => { void refresh(); };
    const timer = window.setInterval(onVisible, POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onRefresh);
    window.addEventListener("online", onRefresh);
    window.addEventListener(FEATURES_STALE_EVENT, onRefresh);
    window.addEventListener(FEATURES_REFRESH_EVENT, onRefresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onRefresh);
      window.removeEventListener("online", onRefresh);
      window.removeEventListener(FEATURES_STALE_EVENT, onRefresh);
      window.removeEventListener(FEATURES_REFRESH_EVENT, onRefresh);
    };
  }, [refresh]);

  const isAdmin = user?.role === "platform_admin";

  const setFlag = useCallback(async (key: FeatureKey, value: boolean) => {
    if (!isAdmin || featureMeta.find((feature) => feature.key === key)?.core) return;
    const previous = flags;
    setFlags({ ...flags, [key]: value }); // optimistisch
    try {
      apply(await features.set(key, value));
    } catch (error) {
      setFlags(previous);
      throw error;
    }
  }, [isAdmin, flags, features, apply]);

  const reset = useCallback(async () => {
    if (!isAdmin) return;
    apply(await features.reset());
  }, [isAdmin, features, apply]);

  const isEnabled = useCallback((key: FeatureKey) =>
    flags[key] === true && (key !== "devAdmin" || isAdmin), [flags, isAdmin]);

  const value = useMemo(
    () => ({ flags, isEnabled, setFlag, reset, refresh, global: features.global }),
    [flags, isEnabled, setFlag, reset, refresh, features.global],
  );
  return <FeatureContext.Provider value={value}>{children}</FeatureContext.Provider>;
}

export function useFeatures() {
  const ctx = useContext(FeatureContext);
  if (!ctx) throw new Error("useFeatures must be used within FeatureProvider");
  return ctx;
}

export { defaultFeatures };

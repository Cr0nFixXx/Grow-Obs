import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Globale Registry aller aktiven Ressourcen (B-49) → Pull-to-Refresh lädt alles Sichtbare neu.
 * Jede gemountete `useResource`-Instanz meldet eine „leise“ Refresh-Funktion an.
 */
type SilentRefresh = () => Promise<boolean>;
const registry = new Set<SilentRefresh>();

/** Lädt alle aktiven Ressourcen im Hintergrund neu. Ergebnis: Anzahl erfolgreich/fehlgeschlagen. */
export async function refreshAllResources(): Promise<{ ok: number; failed: number }> {
  const results = await Promise.all([...registry].map((refresh) => refresh().catch(() => false)));
  return { ok: results.filter(Boolean).length, failed: results.filter((r) => !r).length };
}

/** Last-request-wins; keep current content visible during background refreshes. */
export function useResource<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const serial = useRef(0);
  const mounted = useRef(false);
  const hasData = useRef(false);

  const refresh = useCallback(async () => {
    const request = ++serial.current;
    if (mounted.current) { setLoading(true); setError(null); }
    try {
      const next = await load();
      if (mounted.current && request === serial.current) { setData(next); hasData.current = true; }
    } catch (reason) {
      if (mounted.current && request === serial.current) setError(reason instanceof Error ? reason.message : "Anfrage fehlgeschlagen");
    } finally {
      if (mounted.current && request === serial.current) setLoading(false);
    }
  }, [load]);

  /**
   * Hintergrund-Refresh (Pull-to-Refresh): kein Skeleton, vorhandene Inhalte bleiben stehen.
   * Fehler werden nur gemeldet (Rückgabe `false`), ohne sichtbare Daten durch eine Fehlerseite zu ersetzen.
   */
  const silentRefresh = useCallback(async (): Promise<boolean> => {
    const request = ++serial.current;
    try {
      const next = await load();
      if (mounted.current && request === serial.current) { setData(next); setError(null); setLoading(false); hasData.current = true; }
      return true;
    } catch (reason) {
      if (mounted.current && request === serial.current) {
        if (!hasData.current) setError(reason instanceof Error ? reason.message : "Anfrage fehlgeschlagen");
        setLoading(false);
      }
      return false;
    }
  }, [load]);

  useEffect(() => {
    mounted.current = true;
    hasData.current = false;
    setData(null);
    void refresh();
    registry.add(silentRefresh);
    return () => { mounted.current = false; serial.current += 1; registry.delete(silentRefresh); };
  }, [refresh, silentRefresh]);

  return { data, error, loading, refresh };
}

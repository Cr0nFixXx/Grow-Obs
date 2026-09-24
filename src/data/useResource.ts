import { useCallback, useEffect, useRef, useState } from "react";

/** Last-request-wins; keep current content visible during background refreshes. */
export function useResource<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const serial = useRef(0);
  const mounted = useRef(false);
  const refresh = useCallback(async () => {
    const request = ++serial.current;
    if (mounted.current) { setLoading(true); setError(null); }
    try {
      const next = await load();
      if (mounted.current && request === serial.current) setData(next);
    } catch (reason) {
      if (mounted.current && request === serial.current) setError(reason instanceof Error ? reason.message : "Anfrage fehlgeschlagen");
    } finally {
      if (mounted.current && request === serial.current) setLoading(false);
    }
  }, [load]);
  useEffect(() => {
    mounted.current = true;
    setData(null);
    void refresh();
    return () => { mounted.current = false; serial.current += 1; };
  }, [refresh]);
  return { data, error, loading, refresh };
}
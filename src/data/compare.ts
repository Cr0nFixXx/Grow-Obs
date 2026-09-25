import { useCallback, useSyncExternalStore } from "react";

/**
 * Sortenvergleich: gemeinsame Auswahl für Sorten-Seite und Planer (max. 3).
 * Persistiert in localStorage, damit die Auswahl Navigation und Reload übersteht.
 */
export const COMPARE_KEY = "go-compare";
export const COMPARE_MAX = 3;

let ids: string[] = read();
const listeners = new Set<() => void>();

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(COMPARE_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string").slice(0, COMPARE_MAX) : [];
  } catch {
    return [];
  }
}

function write(next: string[]) {
  ids = next;
  try { window.localStorage.setItem(COMPARE_KEY, JSON.stringify(next)); } catch { /* quota/private mode */ }
  listeners.forEach((l) => l());
}

/** Reine Toggle-Logik (testbar): entfernt vorhandene, fügt neue bis `max` an. */
export function toggleCompareId(current: string[], id: string, max = COMPARE_MAX): { next: string[]; full: boolean } {
  if (current.includes(id)) return { next: current.filter((x) => x !== id), full: false };
  if (current.length >= max) return { next: current, full: true };
  return { next: [...current, id], full: false };
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getSnapshot = () => ids;
const getServerSnapshot = (): string[] => [];

export function useCompare() {
  const selected = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  /** Liefert `false`, wenn die Auswahl bereits voll ist. */
  const toggle = useCallback((id: string) => {
    const { next, full } = toggleCompareId(ids, id);
    if (!full) write(next);
    return !full;
  }, []);
  const clear = useCallback(() => write([]), []);
  const has = useCallback((id: string) => selected.includes(id), [selected]);
  return { selected, toggle, clear, has, max: COMPARE_MAX };
}

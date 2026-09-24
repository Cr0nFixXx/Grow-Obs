/**
 * App-Konfiguration (Build-/Runtime-Flags).
 *
 * `VITE_API_URL` steuert den Daten-Modus:
 *  - nicht gesetzt/leer → MOCK-MODUS (statische Mock-Daten, kein Server nötig)
 *  - gesetzt           → API-MODUS (Service-Implementierungen sprechen das echte Backend an)
 */
export const config = {
  /** Basis-URL des Backends (ohne Trailing-Slash). */
  apiBaseUrl: (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, ""),
  /** true, wenn kein Backend konfiguriert ist → Mock-Services werden verwendet. */
  useMock: !import.meta.env.VITE_API_URL,
} as const;

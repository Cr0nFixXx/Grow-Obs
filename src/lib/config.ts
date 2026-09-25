/**
 * App-Konfiguration (Build-/Runtime-Flags).
 *
 * Die API-URL steuert den Daten-Modus:
 *  - nicht gesetzt/leer → MOCK-MODUS (statische Mock-Daten, kein Server nötig)
 *  - gesetzt           → API-MODUS (Service-Implementierungen sprechen das echte Backend an)
 *
 * Quellen (erste nicht-leere gewinnt):
 *  - Next.js: `NEXT_PUBLIC_API_URL` (wird zur Build-Zeit inline ersetzt)
 *  - Vite:    `VITE_API_URL`        (Legacy-Build `npm run build:vite`)
 */
function readApiUrl(): string {
  let nextUrl: string | undefined;
  try {
    // Literal-Zugriff nötig, damit Next.js den Wert inline ersetzen kann.
    nextUrl = process.env.NEXT_PUBLIC_API_URL;
  } catch {
    // Vite-Browser-Build: `process` existiert nicht.
    nextUrl = undefined;
  }
  // Unter Next.js ist `import.meta.env` undefined → optional chaining.
  const viteUrl = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL;
  return (nextUrl || viteUrl || "").replace(/\/$/, "");
}

const apiBaseUrl = readApiUrl();

export const config = {
  /** Basis-URL des Backends (ohne Trailing-Slash). */
  apiBaseUrl,
  /** true, wenn kein Backend konfiguriert ist → Mock-Services werden verwendet. */
  useMock: !apiBaseUrl,
} as const;

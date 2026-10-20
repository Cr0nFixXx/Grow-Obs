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

/**
 * Pfad-Routing (`/grows/123`) gibt es nur unter Next.js (Catch-All-Route `app/[[...slug]]`). Der Vite-Legacy-Build hat
 * keinen Server dafür und bleibt bei `/?view=…`. Next ersetzt den Literal-Zugriff inline.
 */
function readPathRouting(): boolean {
  try { return !!process.env.NEXT_PUBLIC_APP_BUILD; } catch { return false; }
}

/**
 * Echtzeit-Transport: `auto` (WebSocket → SSE → Polling) oder `polling` (nur Polling, keine Dauerverbindung).
 * Serverless-Hosts (Vercel) können keine WebSockets und halten SSE-Verbindungen als teure, begrenzte Funktionsaufrufe;
 * next.config.ts setzt dort standardmäßig `polling`. Überschreibbar mit `NEXT_PUBLIC_REALTIME=auto|polling` (Build-Zeit).
 */
function readRealtimeMode(): "auto" | "polling" {
  try { return process.env.NEXT_PUBLIC_REALTIME === "polling" ? "polling" : "auto"; } catch { return "auto"; }
}

export const config = {
  /** Basis-URL des Backends (ohne Trailing-Slash). */
  apiBaseUrl,
  /** true, wenn kein Backend konfiguriert ist → Mock-Services werden verwendet. */
  useMock: !apiBaseUrl,
  /** true unter Next.js: URL spiegelt Ansicht (Pfad), false im Vite-Legacy-Build. */
  pathRouting: readPathRouting(),
  /** Echtzeit-Transport (siehe `readRealtimeMode`). */
  realtimeMode: readRealtimeMode(),
} as const;

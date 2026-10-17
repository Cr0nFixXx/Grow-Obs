"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { registerServiceWorker } from "@/lib/pwa";

/**
 * SPA-Einstieg im Next.js App Router.
 * Die gesamte App (Provider, Shell, Router) läuft client-seitig (ssr: false),
 * da Canvas-Partikel, window/navigator-APIs und IndexedDB kein SSR unterstützen.
 *
 * URL-Routing (B-57): Diese optionale Catch-All-Route liefert für JEDEN Pfad (/, /grows/123, /forum …) dieselbe
 * Client-Shell; die Ansicht wird clientseitig aus dem Pfad gelesen (src/lib/routes.ts, src/lib/nav.tsx).
 * `app/api/*` bleibt davon unberührt (spezifischere Segmente haben Vorrang).
 */
const App = dynamic(() => import("@/App"), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-dvh place-items-center text-sm text-fg-muted" role="status">
      Grow|Observer lädt …
    </div>
  ),
});

export default function Page() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") registerServiceWorker();
  }, []);

  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

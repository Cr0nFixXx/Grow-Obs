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
 * Später: Auf echtes File-based-Routing umstellen (app/dashboard/page.tsx, app/grows/page.tsx …)
 * und die view-State-Navigation (useNav) durch next/navigation (useRouter, next/link) ersetzen.
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

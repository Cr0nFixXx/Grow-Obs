"use client";

import dynamic from "next/dynamic";

/**
 * SPA-Einstieg im Next.js App Router.
 * Die gesamte App (Provider, Shell, Router) läuft client-seitig (ssr: false),
 * da Canvas-Partikel, window/navigator-APIs und IndexedDB kein SSR unterstützen.
 *
 * Später: Auf echtes File-based-Routing umstellen (app/dashboard/page.tsx, app/grows/page.tsx …)
 * und die view-State-Navigation (useNav) durch next/navigation (useRouter, next/link) ersetzen.
 */
const App = dynamic(() => import("@/App"), { ssr: false });

export default function Page() {
  return <App />;
}

# MIGRATION.md — Vite SPA → Next.js Monorepo

Schritt-für-Schritt-Anleitung zur Umwandlung des aktuellen Vite-Frontends in ein
**Next.js-Paket innerhalb einer pnpm-Monorepo**.

## Status

| | Aktuell | Ziel |
|---|---|---|
| **Build** | Vite (Single-File `dist/index.html`) | Next.js (App Router) |
| **Routing** | View-State-Context (`useNav`) | File-based (`app/` Directory, `next/navigation`) |
| **Struktur** | Flaches `src/` | Monorepo: `apps/web` + `apps/mobile` + `packages/*` |
| **SSR** | Nein (SPA) | Optional (RSC für Landing/SEO, CSR für Dashboard) |
| **Native** | — | Expo `apps/mobile` ab M7 (`MILESTONES.md`) |

Das Next.js-Skeleton (`app/layout.tsx`, `app/page.tsx`, `next.config.js`, `postcss.config.mjs`,
`pnpm-workspace.yaml`) ist **bereits erstellt** und nutzt das bestehende `src/` via `@`-Alias.

---

## 1. Monorepo aufsetzen

```bash
# pnpm installieren (falls nicht vorhanden)
npm i -g pnpm

# Workspace initialisieren
pnpm init
# → pnpm-workspace.yaml ist bereits vorhanden (apps/*, packages/*)
```

### Ziel-Struktur

```
/
├── pnpm-workspace.yaml          ✅ vorhanden
├── package.json                  (root – Scripts für alle Workspaces)
├── apps/
│   └── web/                      # Next.js App
│       ├── package.json          ("next", "react", "react-dom", "@grow-observer/*")
│       ├── next.config.js        ✅ vorhanden (root – für Dev verschieben)
│       ├── postcss.config.mjs    ✅ vorhanden
│       ├── tsconfig.json         (extends root, "next" types)
│       └── app/
│           ├── layout.tsx        ✅ vorhanden
│           ├── page.tsx          ✅ vorhanden
│           ├── globals.css       (Tailwind-Import)
│           ├── (dashboard)/
│           │   └── page.tsx
│           ├── grows/
│           │   ├── page.tsx
│           │   └── [id]/page.tsx
│           ├── social/page.tsx
│           └── ...weitere Routen
├── packages/
│   ├── ui/                       # Komponenten-Bibliothek
│   │   ├── package.json          ("@grow-observer/ui")
│   │   ├── src/
│   │   │   ├── index.ts          (Re-exports)
│   │   │   ├── ui.tsx
│   │   │   ├── charts.tsx
│   │   │   ├── motion.tsx
│   │   │   ├── Icon.tsx
│   │   │   ├── Particles.tsx
│   │   │   └── Toast.tsx
│   │   └── tsconfig.json
│   ├── shared/                   # Lib, Services, Data, Types, Mocks
│   │   ├── package.json          ("@grow-observer/shared")
│   │   └── src/
│   │       ├── lib/              (theme, nav, hooks, format, config, api, auth, i18n, db, tokens)
│   │       ├── services/
│   │       ├── data/
│   │       ├── types/
│   │       └── mocks/
│   └── layout/                   # AppShell, nav-config
│       └── src/
│           ├── AppShell.tsx
│           └── nav-config.ts
└── src/                          # (Vite-App – kann nach Migration entfernt werden)
```

---

## 2. Packages erstellen

### `packages/ui/package.json`
```json
{
  "name": "@grow-observer/ui",
  "version": "0.1.0",
  "private": true,
  "exports": { ".": "./src/index.ts" },
  "peerDependencies": { "react": ">=19", "react-dom": ">=19" }
}
```

Code aus `src/components/` → `packages/ui/src/` verschieben.
Export-Bundle in `packages/ui/src/index.ts`:
```ts
export * from "./ui";
export * from "./charts";
export * from "./motion";
export { Icon } from "./Icon";
export { Background, Particles } from "./Particles";
export { ToastProvider, useToast } from "./Toast";
```

### `packages/shared/package.json`
```json
{
  "name": "@grow-observer/shared",
  "version": "0.1.0",
  "private": true,
  "exports": { ".": "./src/index.ts" }
}
```

Code aus `src/{lib,services,data,types,mocks}` → `packages/shared/src/`.

---

## 3. Next.js App (`apps/web/`)

### `apps/web/package.json`
```json
{
  "name": "@grow-observer/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "^15",
    "react": "^19",
    "react-dom": "^19",
    "@grow-observer/ui": "workspace:*",
    "@grow-observer/shared": "workspace:*"
  }
}
```

### `next.config.js` (in `apps/web/`)
```js
const nextConfig = {
  transpilePackages: ["@grow-observer/ui", "@grow-observer/shared"],
  images: { remotePatterns: [{ protocol: "https", hostname: "images.pexels.com" }] },
};
module.exports = nextConfig;
```

### Tailwind v4
`postcss.config.mjs` ist bereits vorhanden (`@tailwindcss/postcss`).
`apps/web/app/globals.css`:
```css
@import "tailwindcss";
/* + alle Custom-Tokens aus src/index.css (@theme, :root, @layer …) */
```
In `layout.tsx`: `import "./globals.css"` statt `../src/index.css`.

---

## 4. Routing migrieren (View-State → File-based)

Aktuell nutzt jede Seite `useNav()` für Navigation. In Next.js wird das durch
`useRouter()` + `<Link>` ersetzt:

```tsx
// Vorher (Vite)
import { useNav } from "@/lib/nav";
const { navigate } = useNav();
navigate("grows", { growId: "g1" });

// Nachher (Next.js)
import { useRouter } from "next/navigation";
import Link from "next/link";
const router = useRouter();
router.push("/grows/g1");
// oder: <Link href="/grows/g1">…</Link>
```

### Routen-Mapping
| View-State (aktuell) | Next.js Route |
|---|---|
| `dashboard` | `/` oder `/dashboard` |
| `grows` | `/grows` |
| `grows/{growId}` | `/grows/[id]` |
| `social` | `/social` |
| `strains` | `/strains` |
| `ai` | `/ai` |
| `breeders` | `/breeders` |
| `breeders/{id}` | `/breeders/[id]` |
| `marketplace` | `/marketplace` |
| `wiki` | `/wiki` |
| `wiki/{id}` | `/wiki/[slug]` |
| `forum` | `/forum` |
| `forum/{id}` | `/forum/[id]` |
| `chat` | `/chat` |
| `hallOfFame` | `/hall-of-fame` |
| `calculator` → `report` | `/tools/*` |
| `profile` | `/settings` |
| `auth` | `/login` |

### Layout-Gruppen
```
app/
├── (marketing)/         # Ohne Shell (Login, Onboarding)
│   └── login/page.tsx
├── (app)/               # Mit AppShell (Sidebar, TopBar, BottomNav)
│   ├── layout.tsx       # <AppShell>{children}</AppShell>
│   ├── dashboard/
│   ├── grows/
│   └── social/
```

---

## 5. Service Worker in Next.js

SW-Registrierung als Client-Komponente:
```tsx
// app/sw-register.tsx
"use client";
import { useEffect } from "react";
export function SWRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
// In layout.tsx: <SWRegister />
```

---

## 6. Schritt-für-Schritt Checkliste

1. ✅ Next.js-Skeleton (`app/layout.tsx`, `app/page.tsx`) — vorhanden
2. ✅ Config (`next.config.js`, `postcss.config.mjs`, `pnpm-workspace.yaml`) — vorhanden
3. ⬜ pnpm-Monorepo initialisieren + `apps/web/package.json` erstellen
4. ⬜ `next` installieren: `pnpm --filter @grow-observer/web add next react react-dom`
5. ⬜ `packages/ui` + `packages/shared` erstellen + Code verschieben
6. ⬜ `app/page.tsx` von `dynamic(ssr:false)` auf echtes File-Routing umstellen
7. ⬜ Pro View ein `app/.../page.tsx` mit `useNav()` → `useRouter()` Migration
8. ⬜ `(app)/layout.tsx` mit `<AppShell>` erstellen
9. ⬜ Tailwind v4 in `apps/web` konfigurieren (`globals.css` aus `index.css`)
10. ⬜ `"use client"` an alle interaktiven Komponenten (oder an Layout-Boundary)
11. ⬜ `next/image` statt `<img>` (remotePatterns für Pexels)
12. ⬜ Vite-App (`src/`, `vite.config.ts`, `index.html`) entfernen sobald Next.js stabil
13. ⬜ Danach nicht sofort Native: erst M3 Free-Cloud, dann M5 Sync-Kernel (`MILESTONES.md`)

---

> **Dokumentation gepflegt von:** Claude (Anthropic) · Kennung `claude-grow-dev` · Stand 2026

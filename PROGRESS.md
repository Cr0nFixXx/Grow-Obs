# PROGRESS.md

Chronologisches Protokoll der **Code-Änderungen, Bugfixes und Fortschritte** an Grow|Observer.
Wird nach jedem erfolgreichen Build aktualisiert.

Signiert von `claude-grow-dev` (Claude · Anthropic).

---

## Build-Protokoll

| # | Stand | Ergebnis | Signatur |
|---|-------|----------|----------|
| B-35 | Dev-Admin-Dashboard ausgebaut (Tabs, echte Health-Checks, System, User, Protokoll, Diagnose, Export) + 6 Touch-Fixes | ✅ ~857 kB gzip 307 kB | claude-grow-dev |
| B-33 | Backend-Grundgerüst: apps/api (Hono+Drizzle+Postgres+MinIO), Schema, Auth, CRUD, Docker, Seed | ✅ Frontend-Build grün | claude-grow-dev |
| B-32 | Quick-Wins-Batch: Service-Abschluss (7 Pages) + Auth-Gate + Forum-Actions + ⌘K-Inhaltssuche + Button-Busy + ErrorBoundary | ✅ ~847 kB gzip 304 kB | claude-grow-dev |
| B-31 | Optimierungen/Touch-UX/Code-Checks + InlineIcon + EdgeSwipe refinements | ✅ ~834 kB gzip 300 kB | claude-grow-dev |
| B-30 | Mobile Swipe: Drawer/Sheet dismiss + Edge-open Menü | ✅ ~824 kB gzip 299 kB | claude-grow-dev |
| B-29 | P1 Pages → Services (Social, Grows, Strains, Auth, Dashboard) | ✅ ~823 kB gzip 299 kB | claude-grow-dev |
| B-29b | P1b Pages → Services (Forum, Chat, Wiki, Notifications) + Service-Erweiterung | ✅ ~838 kB gzip 301 kB | claude-grow-dev |
| B-28 | P0b Feature-Flags + Dev-Admin-Panel (Mock) | ✅ ~821 kB gzip 298 kB | claude-grow-dev |
| — | PWA-first Fokus (Flags, Dev-Admin, Self-Host); Editionen/Native zurück | Docs only | claude-grow-dev |
| — | MILESTONES.md (Editionen, Privacy, Native) + Docs-Abgleich | Docs only | claude-grow-dev |
| — | HANDOFF.md + PLAN.md für Coding-Agents (kein App-Code) | Docs only | claude-grow-dev |
| B-27 | v0.12.0 — Next.js Skeleton + Monorepo-Scaffolding + MIGRATION.md | ✅ `dist/index.html` (~813 kB / 296 kB gzip) | claude-grow-dev |
| B-26 | v0.11.0 — Backend-/Daten-Schicht-Grundgerüst (Service-Layer + Auth + API-Client) | ✅ `dist/index.html` (~813 kB / 296 kB gzip) | claude-grow-dev |
| B-25 | v0.10.0 — Bundle-Analyse + ESLint + CI + Font-Subsetting | ✅ `dist/index.html` (~811 kB / 295 kB gzip) | claude-grow-dev |
| B-24 | v0.9.1 — i18n/Währung + Offline-First (IndexedDB) + Rezept-Diff | ✅ `dist/index.html` (~811 kB / 295 kB gzip) | claude-grow-dev |
| B-23 | v0.9.0 — Grow-Report PDF + Design-System-Showcase | ✅ `dist/index.html` (~806 kB / 294 kB gzip) | claude-grow-dev |
| B-22 | v0.8.2 — TopBar: dauerhaft Burger-Menü (Back entfernt) | ✅ `dist/index.html` (~797 kB / 291 kB gzip) | claude-grow-dev |
| B-21 | v0.8.1 — Community-Feed mobile-optimiert | ✅ `dist/index.html` (~797 kB / 291 kB gzip) | claude-grow-dev |
| B-20 | v0.8.0 — Community-Feed (Social-Media-Funktion) | ✅ `dist/index.html` (~797 kB / 291 kB gzip) | claude-grow-dev |
| B-19 | v0.7.0 — Unit-Tests (Vitest) + role=list/listitem | ✅ `dist/index.html` (~798 kB / 290 kB gzip) | claude-grow-dev |
| B-18 | v0.6.1 — PWA/Deploy (PNG-Icons, Background-Sync, apple-touch-icon) | ✅ `dist/index.html` (~787 kB / 289 kB gzip) | claude-grow-dev |
| B-17 | v0.6.0 — Mobile/UX-Paket (PTR, Skeleton, Lang-Druck, Mehr-Overflow) | ✅ `dist/index.html` (~787 kB / 289 kB gzip) | claude-grow-dev |
| B-16 | v0.5.1 — Marktplatz-Filter + SW-Bild-Caching | ✅ `dist/index.html` (~792 kB / 288 kB gzip) | claude-grow-dev |
| B-15 | v0.5.1 — Onboarding responsiv (scrollbare Layer) | ✅ `dist/index.html` (~780 kB / 286 kB gzip) | claude-grow-dev |
| B-14 | v0.5.0 — DataTable + Sorten-Farb-Coding + SmartImage-Fehler + aria-live | ✅ `dist/index.html` (~779 kB / 286 kB gzip) | claude-grow-dev |
| B-13 | v0.4.2 — Popover-Komponente + Forum-Integration | ✅ `dist/index.html` (~788 kB / 287 kB gzip) | claude-grow-dev |
| B-12 | v0.4.2 — Custom Auto-Hide-Scrollbar + Greeting-Responsivität | ✅ `dist/index.html` (~775 kB / 285 kB gzip) | claude-grow-dev |
| B-11 | v0.4.1 — Mobile-Scrollbar Auto-Hide (native Overlay) | ✅ `dist/index.html` (~774 kB / 284 kB gzip) | claude-grow-dev |
| B-10 | v0.4.0 — Accessibility-Paket + Partikel-Toggle + Haptik | ✅ `dist/index.html` (~774 kB / 284 kB gzip) | claude-grow-dev |
| B-09 | v0.3.1 — Tote Schaltflächen interaktiv gemacht | ✅ `dist/index.html` (~771 kB / 283 kB gzip) | claude-grow-dev |
| B-08 | Validierung nach Doku-Erstellung (code unverändert) | ✅ `dist/index.html` (~781 kB / 284 kB gzip) | claude-grow-dev |
| B-07 | v0.3.0 — Notifications Bottom-Sheet + Doku-Set | ✅ `dist/index.html` stabil | claude-grow-dev |
| B-06 | v0.2.0 — SmartImage + CountUp + Swipe | ✅ stabil | claude-grow-dev |
| B-05 | Desktop-Bugfixes (`--sb-w` px, overflow clip) | ✅ stabil | claude-grow-dev |
| B-04 | Mobile-Shell-Optimierung (TopBar, BottomNav, Modal) | ✅ stabil | claude-grow-dev |
| B-03 | Premium-Bilder (Hero/OG inlined), OG-Meta | ✅ stabil | claude-grow-dev |
| B-02 | Bug-Hardening (Charts, ESC), FAB-Position | ✅ stabil | claude-grow-dev |
| B-01 | v0.1.0 — Initiales Template (alle Screens) | ✅ stabil | claude-grow-dev |

---

## Änderungs-Historie (detailliert)

### Dev-Admin + Touch (B-35)
- **`src/lib/diagnostics.ts`** (neu): `checkBackend()` (fetch mit Timeout → API/DB/Storage/AI;
  Mock-Modus → unknown), `systemInfo()` (nur Client-Daten, keine Secrets).
- **`src/pages/DevAdmin.tsx`** (neu geschrieben): Tabs Übersicht/Flags/User/Protokoll/Diagnose,
  Status-Banner, Health-Karten mit Latenz, System-Übersicht, User-Tabelle mit Rollen-/Sperr-Aktionen,
  lokales Audit-Log (`go-dev-log`, max 40), Endpoint-Diagnose (Pfad-Chips + Live-Antwort),
  Flags-Export (JSON) + Overrides kopieren.
- **Touch-Fixes:** BottomSheet-Drag nur am Griff (`dragListener=false` + `dragControls`) → Inhalt
  scrollt; Modal am Mobile mit gleichem Handle-Drag; Drawer `touchAction: "pan-y"`;
  `useEdgeSwipeToOpen` (passiv, kein Overlay-DOM) ersetzt blockierende Kante; `useLongPress` bricht
  bei Bewegung/Leave/Cancel ab; `usePullToRefresh` mit Overlay- & Formular-Guard.

### Docs — MILESTONES + Vision (kein App-Build)
- **`MILESTONES.md`**: Nordstern Native Android/iOS, Editionen Free/Pro/CSC/Enterprise, E2EE,
  local-first vs Free-Cloud, Tombstone-Löschpropagation, QR-Join, Admin/Mod, M0–M12.
- Abgleich: README, HANDOFF, PLAN (P11–P14), ARCHITECTURE (zwei Speicher-Pfade), TODO (offene
  Nordstern-Liste), CLAUDE, DESIGN §10, MIGRATION (apps/mobile), CHANGELOG Unreleased.

### v0.12.0 (B-27)
- **`app/layout.tsx`**: Next.js Root-Layout (Metadata/Viewport/Icons, Fonts, No-FOUC, CSS-Import).
- **`app/page.tsx`**: `"use client"` + `dynamic(() => import("@/App"), { ssr: false })`.
- **`next.config.js`**: Next.js Config (`@`-Alias via tsconfig, Pexels vorbereitet).
- **`pnpm-workspace.yaml`**: Monorepo (`apps/*`, `packages/*`).
- **`MIGRATION.md`**: Vollständige Migration (Package-Split, File-based Routing, Tailwind v4, SW, Checkliste).
- **`App.tsx`**: `"use client"` als Client-Boundary.
- PostCSS-Config entfernt (Vite-Konflikt mit `@tailwindcss/postcss`); in MIGRATION.md dokumentiert.

### v0.11.0 (B-26)
- **`src/types/index.ts`**: zentrale Domänen-Typen (re-exportiert) + `User`/`CreateGrowInput`/`CreatePostInput`.
- **`src/lib/config.ts`**: `apiBaseUrl`/`useMock` via `VITE_API_URL`.
- **`src/lib/api.ts`**: HTTP-Client (`http.*`), `ApiError`, `setAuthToken` (Bearer).
- **`src/lib/auth.tsx`**: `AuthProvider`/`useAuth` (login/register/logout, Restore, Mock+API).
- **`src/services/`**: `interfaces.ts` (Verträge) + `mock.ts` (Mock+IndexedDB+Latenz) + `api.ts` (REST) + `index.ts` (Factory).
- **`src/data/`**: `DataProvider`/`useServices` + `hooks.ts` (`useGrows`/`useStrains`/`useSocialPosts`).
- **`App.tsx`**: `AuthProvider` + `DataProvider` in die Provider-Hierarchie.
- **`.env.example`** + `vite-env.d.ts` + **`ARCHITECTURE.md`**.

### v0.10.0 (B-25)
- **`vite.analyze.config.ts`**: `mergeConfig(base, …)` + `rollup-plugin-visualizer` → `bundle-stats.html`.
- **`eslint.config.js`**: Flat-Config (v9) via `@eslint/js` + `typescript-eslint`, lenient Rules.
- **`.github/workflows/ci.yml`**: CI (tsc-Typecheck + ESLint non-blocking + Vitest + Build).
- **`index.html`**: Inter-Weights auf 400–700 reduziert (Subsetting via Google css2 unicode-range).

### v0.9.1 (B-24)
- **`lib/i18n.tsx`**: `I18nProvider` (locale/currency state, persistiert), `t()` (de/en-Dicts), `money()`
  (Intl + Mock-Rate USD ×1,08).
- **`App.tsx`**: `I18nProvider` in die Provider-Hierarchie.
- **`Profile.tsx`**: Sprach-/Währungs-Switcher + `money()`-Demo + `t()` auf Settings-Überschriften.
- **`lib/db.ts`**: IndexedDB-KV-Wrapper (`dbGet`/`dbSet`/`dbDel`).
- **`Social.tsx`**: Posts via IndexedDB persistieren (Hydration-Ref gegen Überschreiben).
- **`AIAssistant.tsx`**: `diffRecipes()` (added/changed/removed) → dynamischer Diff statt statischem Mock.

### v0.9.0 (B-23)
- **`Report.tsx`**: `exportPDF()` öffnet formatierte Druckansicht (`window.open` + `document.write` +
  `print()`) statt jsPDF → kein Bundle-Bloat; „PDF"-Button angebunden.
- **`Showcase.tsx`** (neu): Komponenten-Galerie (Buttons, Badges/Chips/Avatars, Formulare, Feedback,
  Charts, Overlays, Tone-Swatches) + interaktive Demos (Toast/Modal/Popover/Slider/Toggle/Rating).
- **`nav.tsx`/`App.tsx`/`nav-config.ts`/`AppShell.tsx`**: `showcase`-View integriert.

### v0.8.2 (B-22)
- **`AppShell.tsx` (TopBar)**: Back/Menu-Bedingung (`canGoBack ? … : …`) sowie Desktop-Back-Button
  entfernt → Mobile zeigt dauerhaft das Burger-Menü + Brand. `back`/`canGoBack` aus `useNav()`-Destructure
  entfernt (ungützt). `ArrowLeft` weiterhin in der Command-Palette genutzt.

### v0.8.1 (B-21)
- **`Social.tsx`**: Right rail (`Follow`/`Trending`) → `hidden lg:block` (Mobile: reiner Feed).
- Stories-Card `p-3 sm:p-4` + Scroll-Padding; Action-Bar responsive (`gap-0.5 px-1.5 sm:…`, Buttons
  `px-2 sm:px-3`, Bookmark `size-8 sm:size-9`) → kein Überlauf der Aktionsbuttons auf Mobile.

### v0.8.0 (B-20)
- **`mocks/data.ts`**: `SocialPost`-Typ + `socialPosts`, `stories`, `suggestedGrowers`, `trendingTags`.
- **`nav.tsx`**: `ViewKey` um `social` erweitert.
- **`Social.tsx`** (neu): Community-Feed – Stories-Reihe, Compose-Box, `PostCard` (Like/Kommentar/
  Teilen/Merken, ⋯-Popover), Follow-Vorschläge, Trending-Tags; State für Likes/Bookmarks/Compose + Haptik.
- **`App.tsx`**: `Social` in `views`-Map.
- **`nav-config.ts`** + **`AppShell.tsx`** (`moreNav`): „Community-Feed"-Eintrag.

### v0.7.0 (B-19)
- **`vitest.config.ts`** (node-env, `@`-Alias, `src/**/*.test.ts`).
- **`format.test.ts`**: eur/n/compact/pct/clamp/timeAgo.
- **`charts.test.ts`**: `smooth` (exportiert) – leer / Einzel-Punkt / Mehrere (Anzahl Kurven = Punkte−1).
- **`Forum.tsx`**: Kommentar-Liste `role="list"` + `role="listitem"`.
- **`Dashboard.tsx`**: Aktivitätsfeed `role="list"` + `role="listitem"`.

### v0.6.1 (B-18)
- **`public/icon-192.png` / `icon-512.png`**: generierte App-Icons (flaches Leaf-Glyph auf Waldgrün).
- **`manifest.webmanifest`**: PNG-Icons (192/512, `any` + `maskable`) + SVG-Fallback.
- **`index.html`**: `apple-touch-icon` als PNG (192/512) statt SVG.
- **`sw.js`**: `sync`-Listener (Tag `go-sync`) → re-warmt `SHELL`-Cache.
- **`main.tsx`**: `online`-Event registriert Background-Sync (typsicher gecastet).

### v0.6.0 (B-17)
- **`hooks.ts`**: `usePullToRefresh` (Touch-Pull am Scroll-Top), `useDelayedReady`, `useLongPress`.
- **`AppShell.tsx`**: `PullToRefresh`-Indikator; `BottomNav` mit „Mehr"-Overflow (4 primär + Sheet via `moreNav`).
- **`App.tsx`**: `AsyncPage` (Skeleton-Flash) + `PageSkeleton`.
- **`HallOfFame.tsx`**: `HofCard` mit `useLongPress` → Kontext-BottomSheet (kopieren/merken/melden).

### v0.5.1 (B-15/B-16)
- **`Onboarding.tsx`**: Outer in fixen Hintergrund + scrollbare Layer (`absolute inset-0 overflow-y-auto`,
  `flex min-h-full items-center`) geteilt → Card zentriert/scrollt; Safe-Area-Top; Typo `text-2xl sm:text-3xl`,
  kompaktere Padding/Icons auf Mobile.
- **`Marketplace.tsx`**: Filter-State (`maxPrice`, `conds`) + `list`-Memo erweitert; **Filter-Popover**
  (Zustand-Toggle + Preis-Slider + Reset) + aktive-Filter-Badge.
- **`sw.js`**: Strategien – Navigation network-first (Shell-Fallback), Bilder stale-while-revalidate,
  Rest cache-first; `CACHE` bumped → `go-shell-v2`.

### v0.5.0 (B-14)
- **`ui.tsx`**: `DataTable<T>` (generisch: columns/rows/getKey/renderCell, Zebra, `min-w`-Scroll) +
  `SmartImage` mit Fehler-State (Gradient+Icon-Placeholder via `onError`).
- **`Planner.tsx`**: Vergleichstabelle auf `DataTable` umgestellt (rows=Eigenschaften, columns=Sorten).
- **`Strains.tsx`**: `colorVar` → `typeColor` (Sativa/Indica/Hybrid → info/soil/leaf); Cards & Modal.
- **`AIAssistant.tsx`**: Chat-Container `role="log" aria-live="polite"`.

### v0.4.2 (B-12/B-13)
- **`hooks.ts`**: `useAutoHideScroll` (Scroll-Geometrie + `visible`-Flag, `ResizeObserver`).
- **`AppShell.tsx`**: `MobileScrollbar` (nur `<lg`, fixed Thumb, opacity-Transition beim Scrollen).
- **`index.css`**: Mobile native Scrollbar verborgen (`scrollbar-width:none` + `::-webkit-scrollbar{width:0}`).
- **`ui.tsx`**: `Popover` (Outside-Click/ESC, `role="menu"`, `align`) + `PopoverItem`.
- **`Forum.tsx`**: ⋯-Popover im Thread (kopieren/merken/melden).
- **`Dashboard.tsx`**: Greeting-Buttons `grid grid-cols-2 … sm:flex` (mobile zentriert).

### v0.4.1 (B-11)
- **`index.css`**: Scrollbar-Regeln in Media-Queries aufgeteilt. Custom-Scrollbar (`::-webkit-scrollbar`,
  `scrollbar-width: thin`) nur ab `min-width:1024px`. Mobile (`max-width:1023px`): `scrollbar-width: none`
  (Firefox) + kein WebKit-Styling → native Auto-Hide-Overlay beim Scrollen. `.no-scrollbar`-Utility
  für innere Container bleibt unberührt.

### v0.4.0 (B-10)
- **`hooks.ts`**: `useFocusTrap` (Focus im Overlay halten, Restore bei Close).
- **`ui.tsx`**: Modal/Drawer/BottomSheet mit `panelRef` + `useFocusTrap` + `role="dialog"`/`aria-modal`.
- **`AppShell.tsx`**: Skip-to-Content-Link (`#app-main`), `id` am `<main>`.
- **`Toast.tsx`**: `role="status" aria-live="polite"`.
- **`theme.tsx`**: `particles`-State + `setParticles` (persistiert `go-particles`).
- **`Particles.tsx`** (`Background`): rendert Partikel nur wenn aktiv.
- **`Profile.tsx`**: Toggle „Partikel-Effekte".
- **`format.ts`**: `vibrate()`-Helper; eingesetzt in `AppShell` (BottomNav) & `Forum` (Votes).

### v0.3.1 (B-09)
- **`Planner.tsx`**: Medium-Auswahl als echter State (`selMedium`) mit Highlight (border+ring) + Toast;
  Button toggelt „Auswählen" ↔ „Ausgewählt".
- **`NotFound.tsx`**: „Jetzt starten" → `navigate('dashboard')`.
- **`HallOfFame.tsx`**: „Mehr anzeigen" → Toast (`useToast` ergänzt).
- **`Profile.tsx`**: „Bearbeiten" → Toast.
- **`Chat.tsx`**: Icon-Buttons Info/Anhang/Emoji → Toast-Feedback (`useToast` ergänzt).
- Audit: alle `<button>`/`<Button>` und `aria-label`-Icon-Buttons haben nun Aktionen.

### v0.3.0 (B-07)
- **`AppShell.tsx` / `NotificationsMenu`**: Responsive Refactor – `useMediaQuery`; Mobile rendert
  `BottomSheet`, Desktop absolutes Dropdown. Geteiltes `rows`-Rendering mit `tone()`/`icon()`-Helfern.
- **`AppShell.tsx` (Shell)**: `--sb-w` jetzt `${sidebarCollapsed ? 80 : 272}px` (Bugfix Hauptursache).
- **`AppShell.tsx` (Sidebar)**: `bg-surface/90 backdrop-blur-xl` (vorher `/60`).
- **`index.css`**: `body { overflow-x: clip }` (vorher `hidden`).
- **Doku**: `README.md`, `CLAUDE.md`, `DESIGN.md`, `CHANGELOG.md`, `PROGRESS.md`, `TODO.md`.

### v0.2.0 (B-04…B-06)
- **`motion.tsx`**: `CountUp` (rAF, ease-out-cubic, `usePrefersReducedMotion`).
- **`ui.tsx`**: `StatCard.value: ReactNode`; `SmartImage` (Shimmer bis `onLoad`).
- **`Grows.tsx`**: Lightbox mit `motion.div` Swipe (`drag="x"`).
- **`AppShell.tsx`**: `ScrollToTop` (scrollY>640), Bottom-Nav mit `layoutId`-Top-Indikator,
  TopBar-Refactor (Mobile Back, Safe-Area, Theme in Drawer), FAB/Content safe-area `calc`.
- **`charts.tsx`**: Guards für leere Arrays.
- **`ui.tsx`**: ESC für Modal & Command-Palette.

### v0.1.0 (B-01…B-03)
- Fundament: Design-Tokens, Component-Library, Charts, Particles, Routing, Shell, 21 Screens,
  Mock-Daten, PWA-Gerüst, Onboarding. — alle Details siehe `CHANGELOG.md` v0.1.0.

---

## Bekannte, behobene Bug-Klassen (Lessons)
1. Custom Properties ohne Einheit → immer `px` anhängen. *(behoben B-05)*
2. `overflow-x: hidden` bricht sticky → `clip`. *(behoben B-05)*
3. Parallele Same-File-Edits → sequenziell ausführen. *(Prozess)*
4. Leere Arrays in `Math.min(...)` → Guard. *(behoben B-06)*
5. Mobile Dropdown-Overflow → Bottom-Sheet. *(behoben B-07)*

---

> **Dokumentation gepflegt von:** Claude (Anthropic) · Kennung `claude-grow-dev` · Stand 2026

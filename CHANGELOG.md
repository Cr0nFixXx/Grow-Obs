# CHANGELOG.md

Alle nennenswerten Änderungen an **Grow|Observer**.
Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/).

Jeder Eintrag ist signiert von `claude-grow-dev` (Claude · Anthropic).

---

## [Unreleased]

### Documentation
- `HANDOFF.md` vollständig auf Build B-37, Service-/Backend-/Communities-Stand aktualisiert.
- README, ARCHITECTURE, PLAN, MILESTONES, TODO, CLAUDE, MIGRATION und API-README synchronisiert;
  beschädigte doppelte MILESTONES-Sektion entfernt. — *claude-grow-dev*

### Fixed
- **Runtime/Registry-Audit:** fehlenden `useEdgeSwipeToOpen`-Import sowie durch frühere parallele
  Edits verlorene Admin-Service-Typen/-Registrierungen wiederhergestellt. `AdminService` ist jetzt
  in Mock + API + `Services` Registry vollständig vorhanden. — *claude-grow-dev*
- **Backend:** zuvor dokumentierte, aber nicht persistierte `apps/api/src/routes/admin.ts` jetzt
  tatsächlich vorhanden und in `/admin` gemountet; Social-Like-Query auf korrektes
  `and(eq(...), eq(...))` umgestellt. — *claude-grow-dev*
- **Touch:** Edge-Swipe-Hook hat nun einen stabilen `enabled`-Parameter statt wechselnder No-op-
  Callbacks (keine unnötigen Listener-Neuregistrierungen). — *claude-grow-dev*

### Added
- **Communities MVP**: neue View `communities` (Feature-Flag + Sidebar/Mehr/⌘K), öffentliche und
  private Gruppen, Suche, Erstellen, öffentlicher Beitritt, Invite-Code-Beitritt (`demo-private`
  im Mock), Detail mit Mitglieder-/Rollenverwaltung und Invite-Code-Erstellung. Vollständig über
  `CommunityService` (Mock + API) / `useCommunities` / `useCommunity`. — *claude-grow-dev*
- **Backend Communities**: `/communities` (list/get/create), `/:id/join`, `/:id/invites`, `/join`,
  Member-Rollen-Patch — JWT, Private-Access-Check, Admin-Check, TTL/MaxUses für Invites; Seed enthält
  eine öffentliche und eine private Test-Community. — *claude-grow-dev*
- **Backend-Grundgerüst** (`apps/api`): selbst hostbares REST-Backend (Hono + Drizzle +
  PostgreSQL + MinIO) mit REST-Vertrag exakt passend zum Frontend-Service-Layer. Enthält:
  - Drizzle-Schema (users, grows/logs/photos/env, strains, breeders, products, offers, hall,
    wiki, communities, invites, forum/subs/threads/votes/comments, chat, notifications) + Relations.
  - Auth (Register/Login/Me, Argon2 + JWT), Grows-CRUD mit Ownership, Forum (Threads/Kommentare/
    Votes), Social (Posts/Likes), Chat, Notifications, Katalog-Routen, Presigned S3-Uploads.
  - `docker-compose.yml` (Postgres + MinIO + API), `Dockerfile`, `seed.ts` (Bucket + Admin +
    Katalog + Demo-Content), validierte Env (Zod), API-README.
  - Frontend-`config.useMock`/`VITE_API_URL` schaltet ohne UI-Änderung auf das Backend um.
- **Quick-Wins-Batch** (UI auf echte Daten + Interaktion):
  - *Service-Abschluss:* `Marketplace`, `Breeders`, `HallOfFame`, `Planner`, `Report`, `Profile`, `Dashboard`
    nutzen jetzt Services/Hooks (`useProducts`, `useBreeders`, `useHall`, `useStrains`, `useGrows`,
    `useActivity`, `useSeedOffers`). Neue Services: `ProductService`, `BreederService`, `HallService`,
    `ActivityService`. In-Memory-Store für erstellte Forum-Threads/Kommentare.
  - *Auth-Gate:* App verlangt Login (ungeloggte Views zeigen Auth-Page); Profile zeigt echte Session
    (`useAuth`); Login/Register setzen den User.
  - *Echte Forum-Actions:* „+ Thread“ öffnet BottomSheet-Formular (Titel/Bereich/Text) → `createThread`;
    „Antworten“ postet via `addComment`. Loading-States.
  - *Global-Search (⌘K):* durchsucht jetzt auch Sorten, Threads und Produkte (Inhalt-Sektion), nicht
    nur Navigation.
  - *Button `loading`-Prop* (Spinner + disabled) — genutzt im Auth-Submit.
  - *ErrorBoundary:* globale Fallback-Ansicht bei Render-Crash (Neu laden).
- **P0b Feature-Flags:** `src/config/features.ts` (Defaults) + `FeatureProvider` (localStorage-Overrides).
  Nav, ⌘K, Bottom-Nav „Mehr“ und Views gehorchen `isEnabled()`. Kern-Features nicht abschaltbar.
- **Developer-Admin** (`devAdmin`): Flag-Matrix, Health-Karten (Mock), User-Tabelle (Mock), Reset auf Datei-Defaults.
  Disabled Views → EmptyState mit Link zum Panel. — *claude-grow-dev*

Build: `dist/index.html` ✅ (P0b).

### Fixed — Touch-Gesten (überall sauber)
- **BottomSheet:** `drag="y"` auf dem ganzen Panel nahm dem Browser das native Scrollen des
  Sheet-Inhalts (framer setzt `touch-action: none`). Drag jetzt **nur über den Griff** via
  `dragListener={false}` + `dragControls` — Inhalt scrollt wieder, Sheet lässt sich am Griff schließen.
- **Modal (Mobile):** sah aus wie ein Sheet, hatte aber nur einen dekorativen Griff → gleicher
  Handle-Drag wie BottomSheet (`drag={isMobile ? "y" : false}`).
- **Edge-Swipe (Menü öffnen):** Overlay-DOM (20 px, `z-35`, `touch-none`) blockierte Klicks und
  horizontales Scrollen am linken Rand (Tabs, Segmented, Ticker, Stories). Ersetzt durch **passiven
  window-Listener** (`useEdgeSwipeToOpen`) mit Richtungs-Priorität — kein DOM, keine Blockade.
- **Long-Press (Hall of Fame):** Kontextmenü feuerte bereits beim **Scrollen** über eine Karte.
  Bricht jetzt bei Bewegung > 10 px, Verlassen, Abbruch und Nicht-Primärkontakt ab.
- **Pull-to-Refresh:** löste in offenen Overlays und in Formular-Feldern aus. Prüft jetzt
  Body-Scroll-Lock (Overlay offen) und `input/textarea/select/contenteditable`.
- **Drawer:** explizites `touchAction: "pan-y"` — vertikales Scrollen im Drawer-Inhalt bleibt nativ.
- **Code-Optimierung:** ungenutzte Imports bereinigt (`Grows`), unnötigen Drag-Controls-Import entfernt (`ui.tsx`), Inline-Icon-Platzierung in Text korrigiert. — *claude-grow-dev*
- **P1 Service-Verdrahtung:** Social (`useSocialPosts`, IndexedDB nur noch im Mock-Service), Grows (`useGrows`), Sorten (`useStrains`), Dashboard (aktive Grows aus Service), Auth (`useAuth().login/register`), **Forum/Chat/Wiki/Notifications auf Hooks (keine direkten Mock-Imports)**. — *claude-grow-dev*

---

## [v0.12.0] — 2026

### Added — Next.js Monorepo Vorbereitung
Next.js App Router Skeleton + Monorepo-Scaffolding (der Vite-Build bleibt voll funktionsfähig):
- **`app/layout.tsx`**: Root-Layout (Metadata, Viewport, Fonts, No-FOUC-Theme-Script, CSS-Import).
- **`app/page.tsx`**: `"use client"` + `dynamic`-Import der App (`ssr:false` — Canvas/IndexedDB).
- **`next.config.js`**: Next.js Config (`@`-Alias via tsconfig, strict mode, Pexels-Images vorbereitet).
- **`pnpm-workspace.yaml`**: Monorepo-Workspace (`apps/*`, `packages/*`).
- **`MIGRATION.md`**: Umfassende Schritt-für-Schritt-Migration (Monorepo-Setup, Package-Split,
  File-based Routing-Mapping, Tailwind v4, Service Worker, 12-Punkte-Checkliste).
- `App.tsx` mit `"use client"` (Client-Boundary für Next.js; Vite ignoriert die Direktive). — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-27, ~813 kB / 296 kB gzip).

---

## [v0.11.0] — 2026

### Added — Backend-/Daten-Schicht-Grundgerüst
Saubere Service-Layer-Architektur, die Mock-Daten (Default) und ein echtes Backend (via
`VITE_API_URL`) austauschbar macht – ohne die bestehende UI zu brechen.
- **`src/types/index.ts`**: zentrale Domänen-Typen (re-exportiert + `User` + `CreateGrowInput`/`CreatePostInput`).
- **`src/lib/config.ts`**: `apiBaseUrl` + `useMock`-Flag (gesteuert über `VITE_API_URL`).
- **`src/lib/api.ts`**: HTTP-Client (`http.get/post/put/patch/delete`), `ApiError`, Bearer-Token via `setAuthToken`.
- **`src/lib/auth.tsx`**: `AuthProvider`/`useAuth` (login/register/logout, Token-Persistenz, Session-Restore; Mock & API).
- **`src/services/`**: Service-Verträge (`interfaces.ts`) + Mock-Impl (`mock.ts`, IndexedDB + Latenz) + API-Impl (`api.ts`, REST) + Factory (`index.ts`).
- **`src/data/`**: `DataProvider`/`useServices` + Hooks (`useGrows`, `useStrains`, `useSocialPosts` mit loading/error/refresh + CRUD-Aktionen).
- **`.env.example`** + `vite-env.d.ts` (Env-Typ). `ARCHITECTURE.md` dokumentiert Schichten, Pattern & REST-Konvention.
- App um `AuthProvider` + `DataProvider` erweitert. UI nutzt weiterhin Mock-Daten (Migration erfolgt schrittweise). — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-26, ~813 kB / 296 kB gzip).

---

## [v0.10.0] — 2026

### Added — Infrastruktur / CI
- **Bundle-Analyse**: `vite.analyze.config.ts` (separat, ohne Anpassung der Basis-`vite.config.ts`)
  + `rollup-plugin-visualizer`. Report via `npx vite build --config vite.analyze.config.ts` → `bundle-stats.html`. — *claude-grow-dev*
- **ESLint**: Flat-Config `eslint.config.js` (v9, TypeScript, lenient). Ausführung via `npx eslint .`. — *claude-grow-dev*
- **CI-Pipeline** (`.github/workflows/ci.yml`): `tsc --noEmit` (Typecheck) + ESLint (non-blocking) +
  Vitest + Build. — *claude-grow-dev*

### Changed — Performance
- **Font-Optimierung/Subsetting**: Inter auf die tatsächlich genutzten Weights (400–700) reduziert;
  Google `css2` liefert pro Sprache subsetted WOFF2 (unicode-range) bei `display=swap`. — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-25, ~811 kB / 295 kB gzip).

---

## [v0.9.1] — 2026

### Added — Features-Paket
- **i18n-/Währungs-Umschalter**: `I18nProvider` mit `t()` (de/en) + `money()` (EUR/USD, Mock-Umrechnung
  ×1,08). Sprach- & Währungs-Switcher in den Profile-Settings; Settings-Überschriften lokalisiert;
  Demo-Kosten-Anzeige in der gewählten Währung (Vorbereitung für Voll-i18n). — *claude-grow-dev*
- **Offline-First (IndexedDB)**: `lib/db.ts` (Key-Value-Wrapper). Social-Posts (inkl. eigener Beiträge)
  werden via IndexedDB persistiert und überstehen Reload/Offline. — *claude-grow-dev*
- **Erweiterte AI-Workflows (Mixture-of-Erd's)**: echter **Komponenten-Diff** (added/changed/removed)
  eines Rezepts gegenüber seiner Basis – dynamisch berechnet statt statischem Mock-Diff. — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-24, ~811 kB / 295 kB gzip).

---

## [v0.9.0] — 2026

### Added
- **Grow-Report als PDF**: der „PDF"-Export öffnet eine formatierte Druckansicht (Browser →
  „Als PDF speichern") – offline, ohne schwere Bibliothek (kein jsPDF-Bundle-Bloat). — *claude-grow-dev*
- **Design-System-Showcase**: neue „Design-System"-Seite als Galerie der Komponenten-Bibliothek
  (Buttons, Badges/Chips, Avatare, Formulare, Feedback, Charts, Overlays, Tone-Farben) – in Sidebar,
  Bottom-Nav „Mehr" und Command-Palette erreichbar. — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-23, ~806 kB / 294 kB gzip).

---

## [v0.8.2] — 2026

### Changed
- **TopBar: dauerhaft Burger-Menü** – der Back-Button, der auf Detail-Seiten das Burger-Menü auf Mobile
  ersetzt hatte, wurde entfernt. Das Burger-Menü ist auf Mobile nun **immer** sichtbar (auch auf
  Detail-Seiten). Navigation zurück erfolgt über das Menü oder den „Zurück"-Button im jeweiligen
  PageHeader. — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-22, ~797 kB / 291 kB gzip).

---

## [v0.8.1] — 2026

### Fixed
- **Community-Feed mobile-optimiert**: rechte Seitenleiste (Follow-Vorschläge / Trending-Tags) auf
  Mobile verborgen (nur Desktop = Instagram-Pattern), Stories-Card & Action-Bar mit responsiven
  Abständen kompakter (kein Overflow der Aktionsbuttons mehr). — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-21, ~797 kB / 291 kB gzip).

---

## [v0.8.0] — 2026

### Added
- **Community-Feed (Social-Media-Funktion)**: neue „Social"-Sektion – Instagram/X-artiger Feed mit
  **Stories-Reihe**, **Compose-Box** (Post verfassen), **Posts** (Foto + Text, interaktives
  Like / Kommentar / Teilen / Merken, ⋯-Menü mit Melden), **Follow-Vorschlägen** und **Trending-Tags**.
  Like & Bookmark sind zustandsbasiert; „Teilen" veröffentlicht live in den Feed; Haptik bei Like/Teilen.
  In Sidebar, Bottom-Nav „Mehr" und Command-Palette erreichbar. — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-20, ~797 kB / 291 kB gzip).

---

## [v0.7.0] — 2026

### Added
- **Unit-Tests (Vitest)**: `vitest.config.ts` + `src/lib/format.test.ts` (eur/n/pct/clamp/timeAgo) und
  `src/components/charts.test.ts` (`smooth` Edge-Cases: leer / Einzel-Punkt / Mehrere). Aufruf via
  `npx vitest run`. — *claude-grow-dev*
- **`role="list"`/`role="listitem"`** auf Forum-Kommentaren & Dashboard-Aktivitätsfeed (A11y). — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-19, ~798 kB / 290 kB gzip).

---

## [v0.6.1] — 2026

### Added — PWA/Deploy
- **PNG-Icons (192/512)**: generierte App-Icons (jeweils `any` + `maskable`) ins Manifest aufgenommen
  (zusätzlich zum SVG) für volle Installierbarkeit auf Android/Chrome. — *claude-grow-dev*
- **`apple-touch-icon` als PNG** (192/512) in `index.html` (iOS-Home-Screen). — *claude-grow-dev*
- **Background-Sync**: Service-Worker lauscht auf `sync` (Tag `go-sync`) und re-wärmt die Shell;
  `main.tsx` registriert die Sync bei `online`-Event. — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-18, ~787 kB / 289 kB gzip).

---

## [v0.6.0] — 2026

### Added — Mobile/UX-Paket
- **Pull-to-Refresh** (global): `usePullToRefresh`-Hook + gleitender Indikator; am Scroll-Top ziehen →
  Spinner + „Aktualisiert"-Toast. — *claude-grow-dev*
- **Skeleton-Loading beim View-Wechsel**: `useDelayedReady` + `PageSkeleton` (kurzer Shimmer-Flash pro
  Navigation; `prefers-reduced-motion` → sofort). — *claude-grow-dev*
- **Lang-Druck-Kontextmenü**: `useLongPress` auf Hall-of-Fame-Karten → Bottom-Sheet (Link kopieren /
  Merken / Melden); kurzer Tap bleibt Lightbox. — *claude-grow-dev*
- **Bottom-Nav „Mehr"-Overflow**: 4 primäre Tabs + „Mehr" öffnet ein Sheet mit weiteren Bereichen
  (Marktplatz, KI, Wiki, Hall of Fame, Chat, Kostenrechner). — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-17, ~787 kB / 289 kB gzip).

---

## [v0.5.1] — 2026

### Fixed
- **Onboarding/Willkommen responsiv**: scrollbare Layer (Card zentriert bei Platz, scrollt bei
  Overflow), Safe-Area-Top, responsive Typo/Spacing/Icons – kein Abschneiden mehr auf kurzen Viewports. — *claude-grow-dev*

### Added
- **Marktplatz-Filter (echt)**: Popover mit Zustand (Neu/Wie neu/Gebraucht) + Preis-Slider + Reset;
  Live-Filterung der Produkte + aktive-Filter-Badge. — *claude-grow-dev*
- **Service-Worker**: stale-while-revalidate für Bilder (inkl. remote Pexels), Navigation network-first
  mit Offline-Shell-Fallback. — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-15/B-16, ~792 kB / 288 kB gzip).

---

## [v0.5.0] — 2026

### Added
- **`DataTable`-Komponente** (generisch, zugänglich, Zebra-Zeilen, Horizontal-Scroll) für die Library;
  die Planner-Vergleichstabelle wurde darauf umgestellt. — *claude-grow-dev*
- **SmartImage-Fehler-Fallback**: Gradient + Icon-Placeholder bei Lade-Fehlern statt kaputtem Bild. — *claude-grow-dev*
- **Sorten-Farb-Coding**: konsistente Typ-Farben (Sativa = info / Indica = soil / Hybrid = leaf) für
  Strain-Cards & Strain-Detail-Modal. — *claude-grow-dev*

### Changed
- AI-Chat-Nachrichten-Container nun `role="log"` + `aria-live="polite"` (Streaming für Screenreader). — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-14, ~779 kB / 286 kB gzip).

---

## [v0.4.2] — 2026

### Added
- **Custom Auto-Hide-Scrollbar** (Mobile): `useAutoHideScroll`-Hook + `MobileScrollbar` – ein schmaler
  Thumb erscheint **nur beim Scrollen** und blendet danach aus. Native Leiste auf Mobile verborgen
  (`scrollbar-width:none` + WebKit `width:0`). Funktioniert zuverlässig in Vorschau & nativ. — *claude-grow-dev*
- **Popover-Komponente** (`Popover` + `PopoverItem`) für die Library (Outside-Click- & ESC-Schließen,
  `role="menu"`); integriert im Forum-Thread als ⋯-Menü (Link kopieren / Merken / Melden). — *claude-grow-dev*

### Changed
- Dashboard-Greeting-Buttons auf Mobile: 2 gleichbreite Spalten (zentriert) statt knapper Inline-Buttons. — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-12/B-13).

---

## [v0.4.1] — 2026

### Changed
- **Mobile-Scrollbar**: Custom-Scrollbar nur noch ab `lg` (Desktop). Auf Mobile wird sie nicht
  mehr gerendert → iOS/Android zeigen das **native Auto-Hide-Overlay** (nur während des Scrollens
  sichtbar); Firefox Mobile verbirgt die Leiste. — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-11).

---

## [v0.4.0] — 2026

### Added
- **Accessibility-Paket**: Focus-Trap in Modal/Drawer/BottomSheet (neuer `useFocusTrap`-Hook),
  Skip-to-Content-Link am Shell-Anfang, `aria-live` für Toasts. — *claude-grow-dev*
- **Partikel-Toggle** in den Profile-Settings (Spec-Anforderung „abschaltbar"), via `ThemeProvider`
  persistiert (`localStorage`). — *claude-grow-dev*
- **Haptisches Feedback**: `vibrate()`-Helper, eingesetzt bei Bottom-Nav-Taps & Forum-Votes. — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-10, ~774 kB / 284 kB gzip).

---

## [v0.3.1] — 2026

### Fixed
- **Tote Schaltflächen interaktiv gemacht** – zuvor ohne Aktion: `Planner` „Auswählen" (jetzt echte
  Medium-Auswahl mit State + Highlight), `NotFound` „Jetzt starten" (→ Dashboard),
  `HallOfFame` „Mehr anzeigen", `Profile` „Bearbeiten", `Chat`-Icon-Buttons (Info/Anhang/Emoji).
  Alle Schaltflächen reagieren nun mit Toast-/Navigations-Feedback. — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-09).

---

## [v0.3.0] — 2026

### Added
- **Notifications als mobiles Bottom-Sheet**: Auf Mobile gleitet das Benachrichtigungs-Menü nun als
  Slide-Up-Sheet hoch (natives Pattern) statt als überlaufendes Dropdown. Desktop bleibt Dropdown.
  — *claude-grow-dev*
- **Komplettes Doku-Set**: `README.md` (aktualisiert), `CLAUDE.md`, `DESIGN.md`, `CHANGELOG.md`,
  `PROGRESS.md`, `TODO.md` – jede Datei signiert. — *claude-grow-dev*

### Fixed
- **Desktop-Sidebar-Overlap (kritisch)**: `--sb-w` wurde ohne `px`-Einheit gesetzt →
  `padding-left: 272` (ungültig) → Sidebar überlappte den gesamten Content auf Desktop.
  Korrigiert zu `${w}px`. — *claude-grow-dev*
- **Sticky-TopBar-Sicherheit**: `overflow-x: hidden` → `overflow-x: clip` auf `body`
  (verhindert Sticky-Breaking). — *claude-grow-dev*
- **Sidebar-Lesbarkeit**: Opazität `/60` → `/90` (war sinnlos transparent). — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (Single-File). Letzter erfolgreicher Build validiert.

---

## [v0.2.0] — 2026

### Added
- **Count-up-Animationen**: `CountUp`-Komponente (motion.tsx, ease-out-cubic, reduced-motion-safe);
  Dashboard-Stat-Karten zählen beim Betreten hoch. — *claude-grow-dev*
- **Swipe-Gesten**: Grow-Galerie-Lightbox per `drag="x"` + `dragSnapToOrigin`. — *claude-grow-dev*
- **Scroll-to-Top-Button** (mobile) mit Spring-Animation. — *claude-grow-dev*
- **Smart-Image-Loading**: `SmartImage` mit Shimmer-Placeholder; integriert in Hall of Fame,
  Dashboard-Grow-Cards, Grow-Liste/-Detail. — *claude-grow-dev*

### Changed
- **Modal → Bottom-Sheet auf Mobile**: Slide-up, Handle-Bar, sticky Footer; Desktop bleibt zentriert. — *claude-grow-dev*

### Fixed
- **Charts hartiert** gegen leere Arrays (`Sparkline`, `Bars`). — *claude-grow-dev*
- **ESC schließt** jetzt Command-Palette & Modal (vorher nur Anzeige). — *claude-grow-dev*

---

## [v0.1.0] — 2026 — Initiales Template

### Added
- Komplettes Design-System (Light/Dark, Tokens, Glass/Neu, Elevation, Glow, Grain).
- 21 Screen-Kategorien: Dashboard, Auth, Grows, Strains, Breeders, Marketplace, Wiki, Forum, Chat,
  Hall of Fame, Kostenrechner, Verbrauch, Simulation, Planung, Report, AI-Assistent (inkl.
  Mixture-of-Erd's Git-Diff), Notifications, Profil/Settings, Telegram, Onboarding/Splash/404.
- Wiederverwendbare Component-Library (ui.tsx) + eigene SVG-Charts (charts.tsx).
- Layout-Shell: Sidebar, TopBar, BottomNav, FAB, Drawer, Command-Palette (⌘K), Toasts.
- Partikel-Background (Canvas), Framer-Motion Animationen, `prefers-reduced-motion`.
- PWA-Grundgerüst: `manifest.webmanifest`, `sw.js`, `icon.svg`; Onboarding/Install-Prompt.
- Zentrale Mock-Daten (`mocks/data.ts`), atmosphärischer Hero (inlined). — *claude-grow-dev*

---

> **Dokumentation gepflegt von:** Claude (Anthropic) · Kennung `claude-grow-dev` · Stand 2026

# PROGRESS.md

Build-Protokoll von **Grow|Observer**: eine Zeile je abgeschlossener Aufgabe (B-Nummer) mit Kurzbeschreibung und gemessenem Ergebnis.
Details, Prüfzeilen und Verhaltensänderungen stehen im [CHANGELOG](CHANGELOG.md); Teststand und offene Gates in [TESTING](TESTING.md).

**Pflege:** Nach jeder abgeschlossenen Aufgabe eine neue Zeile **oben** einfügen (neueste zuerst), nur Zahlen, die tatsächlich gemessen wurden. Keine Agenten-Signatur.
Die frühere Zählung (`v0.x`, vor B-52) ist historisch; seit B-52 gelten die Versionen aus `version.json`.
Das vollständige alte Protokoll samt detaillierter Änderungs-Historie: [archive/PROGRESS-bis-B62.md](archive/PROGRESS-bis-B62.md).

---

| # | Stand | Ergebnis |
|---|-------|----------|
| B-69 | Code-Audit: Überlauf in Einstellungen/Simulation/Telegram behoben, Eingaben ≥ 16 px, Beschriftungen, Sterne, Touch-Ziele, Avatar-Ring, Seitentitel | typecheck ✅ lint ✅ vitest 226/226 ✅ E2E 41 + 1 übersprungen ✅ |
| B-68 | Markieren aus (außer Eingabefelder, gegen Chrome-Suchleiste); `api_error` loggt Code, Pfad und Ursache | typecheck ✅ lint ✅ vitest 226/226 ✅ E2E mobil 2/2 ✅ · Ursache der 500er offen |
| B-67 | Mobil: Pinch-Zoom aus, `translate="no"`, Chat als Vollbild auf Telefon, kein Überlauf bei 360 px, Seite scrollt im Chat nicht mit | typecheck ✅ lint ✅ vitest 226/226 ✅ E2E 40 + 1 übersprungen ✅ · echtes Android/iOS nicht geprüft |
| B-66 | Vercel-Betrieb: `DB_POOL_MAX`, `SKIP_MIGRATIONS`, reines Polling (`NEXT_PUBLIC_REALTIME`, Standard auf Vercel), Ursache im Boot-Log; Supabase-RLS aktiviert | typecheck ✅ lint ✅ vitest 226/226 ✅ API 221/221 ✅ · Last auf Vercel/E2E nicht geprüft |
| B-65 | Gruppenchats: Einladung mit Annahme, Rollen (Admin), Gruppenbild, Themen (privat, nur Admins, geschlossen, angeheftet, stumm, Ungelesen je Thema), Verlauf einstellbar, Hinweiszeilen, Push je Thema (Migration 0014) | typecheck ✅ lint ✅ vitest 222/222 ✅ API 219/219 ✅ E2E 39 ✅ (1 übersprungen) build ✅ · echtes Gerät nicht geprüft |
| B-64 | PNG-App-Icons (192, 512, maskable 512) aus `icon.svg`, ≈ 190 KB; vom Manifest referenziert, fehlten seit `2a81529` | vitest ✅ build ✅ · Launcher-Zuschnitt/Android-Installation nicht geprüft |
| B-63 | Web-Push: Kategorien, neutraler Sperrbildschirm (Vorschau optional), Ruhezeit, kein Push bei Online, Geräte je Sitzung, VAPID über `push:keys`, Feature-Flag `push` (Migration 0013) | typecheck ✅ lint ✅ vitest 203/203 ✅ API 192/192 ✅ E2E 38 ✅ (1 übersprungen) · echte Gerätezustellung nicht geprüft |
| Docs | Motion-Graphics-Promo-Kit `promo-kit/` (Engine, Szenen, Screenshots, Mockups, Key-Visuals, Brand, Briefing); kein Produktcode geändert | Setup-Smoke-Test ✅ Testrender ✅ Audio ✅ nahtloser Loop ✅ voller 60-s-Render nicht neu gelaufen |
| Docs | Promo-Demo-Video (`promo/`), `PROMODEMO.md`, drei Agent-Skills (+ generische Kopien), `npm run docs:check`; kein Produktcode geändert | docs:check ✅ version:check ✅ Promo-Build reproduziert ✅ |
| Docs | Dokumentations-Umbau (Struktur, Sprachen, eine Quelle je Fakt; kein Code geändert) | Links und Fakten gegen den Code geprüft ✅ |
| B-62 | Echte 404 (HTTP 404 + `not-found.tsx`, App-Ansicht `notFound`), Sorten-Detail-URL `/strains/<id>`, 400 bei kaputter URL-Kodierung | typecheck ✅ lint ✅ vitest 181/181 ✅ API 155/155 ✅ E2E 37/37 ✅ |
| B-61 | Community-Moderation: Feed je Community, Ausblenden (Beiträge/Kommentare), Rauswurf mit optionaler Sperre + Sperrliste, Meldungen + Warteschlange (Migration 0012) | typecheck ✅ lint ✅ vitest 180/180 ✅ API 155/155 ✅ E2E 34/34 ✅ |
| B-60 | Rate-Limit über mehrere Instanzen: gemeinsame PostgreSQL-Tabelle `rate_limits` (0011, atomarer Upsert, Hash-Schlüssel, Ersatzzähler bei DB-Ausfall) | typecheck ✅ lint ✅ vitest 169/169 ✅ API 139/139 ✅ E2E 31/31 ✅ zwei echte API-Prozesse real geprüft |
| B-59 | Chat-/Echtzeitsystem: WebSocket → SSE → Polling über PostgreSQL `LISTEN/NOTIFY`, Direktnachrichten, Lesepositionen/Badge, „schreibt …“, Online-Status, Live-Benachrichtigungen und Forum-Kommentare, `scripts/server.mjs`, Migration 0010 | typecheck ✅ lint ✅ vitest 169/169 ✅ API 130/130 ✅ E2E 31/31 ✅ WS/SSE im Vorschau-Proxy und im `dist/`-API real geprüft |
| B-58 | Erzwungener Passwortwechsel nach Einmalpasswort (`must_change_password`/0009, Server-Sperre 403, Vollbild-UI), `admin:create --reset-password` | typecheck ✅ lint ✅ vitest 135/135 ✅ API 108/108 ✅ E2E 28/28 ✅ CLI real geprüft |
| B-57 | URL-Routing: Pfade (`/grows/<id>` …), History-Kopplung, tiefer Link nach Login, Catch-All-Route, SW-Routen, Teilen-Links | typecheck ✅ lint ✅ vitest 134/134 ✅ E2E 26/26 ✅ |
| B-56 | Betreiber-Bootstrap: `admin:create` (CLI, Zufallspasswort einmalig, `--promote` mit Sitzungsende, Protokoll `role_changed`), Docker-Profil `tools` | typecheck ✅ lint ✅ vitest 116/116 ✅ API 90/90 ✅ E2E 20/20 ✅ CLI real geprüft |
| B-55 | Passwort ändern (aktuelles Passwort, beendet andere Sitzungen), Anmeldeprotokoll ohne IP (90 Tage, `login_events`/0008), Gerätelimit 5 | typecheck ✅ lint ✅ vitest 116/116 ✅ API 83/83 ✅ E2E 20/20 ✅ |
| B-54 | Session-Härtung: HttpOnly-Cookie statt Bearer/localStorage, Tabelle `sessions` (0007), Logout/„Alle Geräte“/Geräteliste, CSRF-Guard, CORS-Credentials, 401-Auto-Abmeldung | typecheck ✅ lint ✅ vitest 110/110 ✅ API 68/68 ✅ (+ API-Typecheck/Tools; B-54.1/54.2 Fixes für die iframe-Vorschau, Header-Fallback) E2E 19 ✅ · next build ✅ vite build ✅ · Build-Nummer siehe `version.json` |
| B-53 | Keine Demo-Daten im API-Modus (Dashboard, Auth, Strains, Verbrauch, Wiki, Social, KI-Assistent), Avatar-Initialen-Fallback, Passwort-Hinweis, `fixme` → grüner E2E | typecheck ✅ lint ✅ vitest 98/98 ✅ API 36/36 ✅ E2E 13 ✅ · next build ✅ · Build-Nummer siehe `version.json` |
| B-52 | Zentrale Versionierung (`version.json`, Skript, Backend-Generierung, CI-Check, Anzeige), Preview-Skript, Eigner-Regeln in CLAUDE/HANDOFF | typecheck ✅ lint ✅ vitest 91/91 ✅ API 36/36 ✅ (+ API-Typecheck) E2E 8 ✅ + 1 fixme · next build ✅ vite build ✅ · Build-Nummer siehe `version.json` |
| B-51 | Härtung: Rate-Limits (Login/Register/Upload), JWT-Pflicht in Produktion, hero.jpg-Build-Fix, Root-Lockfile, Playwright-E2E + Migration 0006 (Forum-Bereiche) | Node 22.23 · PG 17 · typecheck ✅ lint ✅ vitest 86/86 ✅ API 34/34 ✅ E2E 7 ✅ + 1 fixme next build ✅ vite build ✅ (964 kB / 341 kB gzip) |
| B-50 | App-Updates: Build-ID + /api/version, Einstellungen (auto/nachfragen/manuell, Was ist neu), Admin-Releases inkl. Pflicht-Update + Feature-Freischaltung, Migration 0005 | API 24/24 ✅ · vitest ✅ · Update-Erkennung live mit zwei Builds ✅ (siehe TESTING.md) |
| B-49 | Globale Feature-Flags (DB + 403-Sperre + Polling/Fokus/PTR), echtes Pull-to-Refresh (leise, alle Ressourcen, SW-Update), Migration 0004 | API 23/23 ✅ · vitest 76/76 ✅ · Validierung siehe TESTING.md |
| B-48 | UI/UX: Slider, Gesten-Zonen, Remember-Me, Logout, Badges/Glocke, Notification-Links, PWA-Install + Icons, Forum-Votes/Antworten, Hall/Social-Kommentare, Migration 0003 | API 22/22 ✅ · vitest 71/71 ✅ · Validierung siehe TESTING.md |
| B-47 | Media in PostgreSQL + Uploads (Social/Chat/Galerie/Avatar), Profil-Editor, Emoji, Teilen, Sammlung, Deep-Links, Migration 0002 | API 20/20 ✅ · vitest 64/64 ✅ · Validierung siehe TESTING.md |
| B-46 | Embedded-API unter /api, Auto-Migration, API-Modus Standard, Sandbox-DB migriert + Seed | Persistenz nach Neustart ✅ · 37 Endpunkte gegen echte DB ✅ · Validierung siehe TESTING.md |
| B-45 | Paket 3 (Service-Layer statt Mocks, Typen, Lazy-Views, Audit) + API-Routen strains/wiki/tasks + Migration 0001 | typegen ✅ tsc ✅ lint ✅ vitest ✅ next build ✅ · API typecheck/build ✅ · API-Integration 15/15 ✅ · Migration 0000→0001 mit Daten ✅ · npm audit Frontend 0 |
| B-44 | Gesten im ganzen Panel + Toasts + Tab-Wischen, View `create` (5 Schnellaktionen), Vollbild-Galerie, Sortenvergleich, Hall-of-Fame-Karte | typegen ✅ tsc ✅ lint ✅ vitest 61/61 ✅ next build ✅ (siehe TESTING.md) |
| B-43 | Paket 2: tote Dateien/Exporte entfernt (`InlineIcon.tsx`, `pnpm-workspace.yaml`, doppeltes `public/images/hero.jpg`, `checkBackend`, `simulationCurve`), Test-/Lint-Tools → devDependencies, CI auch auf Branch `A`, PLAN/MIGRATION/TODO mit B-42-Status | siehe TESTING.md (B-43) |
| B-42 | API-Blocker (migrate.ts, Install-Abbruch), Next.js-SPA-Hülle + `/api/health`, `src/pages`→`src/views`, SW-Policy für `/_next/static`, react-hooks-Lint, `.gitignore` | **Ausgeführt:** typegen ✅ tsc ✅ lint 0/0 ✅ vitest 52/52 ✅ next build ✅ vite build ✅ (870 kB) · API typecheck/tools/build ✅ · API-Integration 13/13 ✅ |
| B-41 | Mobile Touch: Snapback, große Drag-Zonen, SwipeLightbox, Slider/Targets, PTR-Haptik, iOS Scroll-Lock, Touch-Ticker | Vite-Build erfolgreich: 867.61 kB, gzip 311.75 kB; Tests/Geräte offen |
| B-40 | Tailwind-Scan-Scope auf `src/`+`index.html`+`app/` begrenzt (`source(none)`) → Bundle unabhängig von Doku/API | Vite-Build erfolgreich: **861.90 kB, gzip 310.15 kB** (kleiner als B-38); Klassen verifiziert |
| B-39 | Doku-Verifikation gegen Code; `.env.example`-Falle, Test-Typecheck und API-DevDep korrigiert | Vite-Build erfolgreich: 862.56 kB, gzip 310.29 kB (unverändert); API weiterhin uncompiled |
| B-38 | Backend-/Auth-/PWA-Stabilisierung, Admin-Service-Anbindung, Regressionstests und API-CI | Vite-Build erfolgreich: 862.56 kB, gzip 310.29 kB; Tests/Typechecks/Docker hier nicht ausgeführt |
| B-37 | Communities MVP (UI + Mock/API Service + Backend CRUD/Invite/Rollen + Seed) | ✅ ~859 kB gzip 309 kB |
| B-36 | Runtime-/Registry-Audit: Admin-Service + Admin-Route wiederhergestellt, Social-Query fix, EdgeSwipe enabled-Guard | ✅ ~860 kB gzip 308 kB |
| B-35 | Dev-Admin-Dashboard ausgebaut (Tabs, echte Health-Checks, System, User, Protokoll, Diagnose, Export) + 6 Touch-Fixes | ✅ ~857 kB gzip 307 kB |
| B-33 | Backend-Grundgerüst: apps/api (Hono+Drizzle+Postgres+MinIO), Schema, Auth, CRUD, Docker, Seed | ✅ Frontend-Build grün |
| B-32 | Quick-Wins-Batch: Service-Abschluss (7 Pages) + Auth-Gate + Forum-Actions + ⌘K-Inhaltssuche + Button-Busy + ErrorBoundary | ✅ ~847 kB gzip 304 kB |
| B-31 | Optimierungen/Touch-UX/Code-Checks + InlineIcon + EdgeSwipe refinements | ✅ ~834 kB gzip 300 kB |
| B-30 | Mobile Swipe: Drawer/Sheet dismiss + Edge-open Menü | ✅ ~824 kB gzip 299 kB |
| B-29 | P1 Pages → Services (Social, Grows, Strains, Auth, Dashboard) | ✅ ~823 kB gzip 299 kB |
| B-29b | P1b Pages → Services (Forum, Chat, Wiki, Notifications) + Service-Erweiterung | ✅ ~838 kB gzip 301 kB |
| B-28 | P0b Feature-Flags + Dev-Admin-Panel (Mock) | ✅ ~821 kB gzip 298 kB |
| B-27 | v0.12.0 — Next.js Skeleton + Monorepo-Scaffolding + MIGRATION.md | ✅ `dist/index.html` (~813 kB / 296 kB gzip) |
| B-26 | v0.11.0 — Backend-/Daten-Schicht-Grundgerüst (Service-Layer + Auth + API-Client) | ✅ `dist/index.html` (~813 kB / 296 kB gzip) |
| B-25 | v0.10.0 — Bundle-Analyse + ESLint + CI + Font-Subsetting | ✅ `dist/index.html` (~811 kB / 295 kB gzip) |
| B-24 | v0.9.1 — i18n/Währung + Offline-First (IndexedDB) + Rezept-Diff | ✅ `dist/index.html` (~811 kB / 295 kB gzip) |
| B-23 | v0.9.0 — Grow-Report PDF + Design-System-Showcase | ✅ `dist/index.html` (~806 kB / 294 kB gzip) |
| B-22 | v0.8.2 — TopBar: dauerhaft Burger-Menü (Back entfernt) | ✅ `dist/index.html` (~797 kB / 291 kB gzip) |
| B-21 | v0.8.1 — Community-Feed mobile-optimiert | ✅ `dist/index.html` (~797 kB / 291 kB gzip) |
| B-20 | v0.8.0 — Community-Feed (Social-Media-Funktion) | ✅ `dist/index.html` (~797 kB / 291 kB gzip) |
| B-19 | v0.7.0 — Unit-Tests (Vitest) + role=list/listitem | ✅ `dist/index.html` (~798 kB / 290 kB gzip) |
| B-18 | v0.6.1 — PWA/Deploy (PNG-Icons, Background-Sync, apple-touch-icon) | ✅ `dist/index.html` (~787 kB / 289 kB gzip) |
| B-17 | v0.6.0 — Mobile/UX-Paket (PTR, Skeleton, Lang-Druck, Mehr-Overflow) | ✅ `dist/index.html` (~787 kB / 289 kB gzip) |
| B-16 | v0.5.1 — Marktplatz-Filter + SW-Bild-Caching | ✅ `dist/index.html` (~792 kB / 288 kB gzip) |
| B-15 | v0.5.1 — Onboarding responsiv (scrollbare Layer) | ✅ `dist/index.html` (~780 kB / 286 kB gzip) |
| B-14 | v0.5.0 — DataTable + Sorten-Farb-Coding + SmartImage-Fehler + aria-live | ✅ `dist/index.html` (~779 kB / 286 kB gzip) |
| B-13 | v0.4.2 — Popover-Komponente + Forum-Integration | ✅ `dist/index.html` (~788 kB / 287 kB gzip) |
| B-12 | v0.4.2 — Custom Auto-Hide-Scrollbar + Greeting-Responsivität | ✅ `dist/index.html` (~775 kB / 285 kB gzip) |
| B-11 | v0.4.1 — Mobile-Scrollbar Auto-Hide (native Overlay) | ✅ `dist/index.html` (~774 kB / 284 kB gzip) |
| B-10 | v0.4.0 — Accessibility-Paket + Partikel-Toggle + Haptik | ✅ `dist/index.html` (~774 kB / 284 kB gzip) |
| B-09 | v0.3.1 — Tote Schaltflächen interaktiv gemacht | ✅ `dist/index.html` (~771 kB / 283 kB gzip) |
| B-08 | Validierung nach Doku-Erstellung (code unverändert) | ✅ `dist/index.html` (~781 kB / 284 kB gzip) |
| B-07 | v0.3.0 — Notifications Bottom-Sheet + Doku-Set | ✅ `dist/index.html` stabil |
| B-06 | v0.2.0 — SmartImage + CountUp + Swipe | ✅ stabil |
| B-05 | Desktop-Bugfixes (`--sb-w` px, overflow clip) | ✅ stabil |
| B-04 | Mobile-Shell-Optimierung (TopBar, BottomNav, Modal) | ✅ stabil |
| B-03 | Premium-Bilder (Hero/OG inlined), OG-Meta | ✅ stabil |
| B-02 | Bug-Hardening (Charts, ESC), FAB-Position | ✅ stabil |
| B-01 | v0.1.0 — Initiales Template (alle Screens) | ✅ stabil |

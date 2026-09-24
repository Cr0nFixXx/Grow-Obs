# TODO.md

Offene Punkte für **Grow|Observer**.
Status-Legende: `[ ]` offen · `[~]` in Arbeit · `[x]` erledigt.

- **Template-Scope (UI)** ist vollständig `[x]`.
- **Nächste Code-Arbeit:** `PLAN.md` ab P1.
- **Produkt-Nordstern:** `MILESTONES.md` (nicht an M7 Native beginnen vor M1–M3).

Pflege: `claude-grow-dev` (Claude · Anthropic).

---

## 🚀 Jetzt (PWA first)

- [x] **Feature-Flags** `src/config/features.ts` + Nav/View-Gates. *(PLAN P0b)*
- [x] **Developer-Admin-Panel** (Betreiber: Flags, Health, User-Mock). *(P0b)*
- [x] **Pages → Services** (Auth, Grows, Social, Strains, Dashboard). *(P1)*
- [ ] **Self-Host-Backend** (Docker: API, Postgres, MinIO) + Auth/Grows/Communities. *(P4–P6)*
- [ ] **Community-Funktionen** auf dem Server (Invite, Rollen, Mod). *(P7)*
- [ ] **AI-Proxy** serverseitig, per Flag. *(P9)*
- [ ] **PWA-Härtung** (SW, Offline-Shell). *(P10)*

## 🌙 Später (Nordstern — MILESTONES.md §0)

- [ ] Editionen Free/Pro/CSC/Enterprise
- [ ] Local-first + E2EE + Tombstones
- [ ] Native Android/iOS
- [ ] IAP / Paywall

---

## 🐛 Bekannte Issues / Verifizieren
- [x] **Desktop-Darstellung**: Sidebar-Overlap (`--sb-w` px) behoben, Sticky via `overflow-x: clip`
  gesichert (v0.3.0/v0.4.1). — claude-grow-dev
- [x] **Mobile Notifications**: als responsives Bottom-Sheet umgesetzt, kein Überlauf mehr (v0.3.0/v0.4.2). — claude-grow-dev

---

## ✨ Vorschläge – Mobile / UX
- [x] **Pull-to-Refresh** (global, `usePullToRefresh` + Indikator). *(v0.6.0)*
- [x] **Skeleton-Loading-Phasen** beim View-Wechsel (`useDelayedReady` + `PageSkeleton`). *(v0.6.0)*
- [x] **Lang-Druck-Kontextmenü** (Kopieren/Merken/Melden) auf Hall-of-Fame-Karten. *(v0.6.0)*
- [x] **Haptisches Feedback** (`navigator.vibrate`) bei Votes/Taps. *(v0.4.0)*
- [x] **Bottom-Nav "Mehr"-Overflow**: 4 primäre Tabs + „Mehr"-Sheet. *(v0.6.0)*
- [x] **Bild-Fehler-Placeholder** (SmartImage `onError` → Gradient+Icon). *(v0.5.0)*

## ✨ Vorschläge – Features
- [x] **Manueller Partikel-Toggle** in den Settings (Spec: „abschaltbar"). *(v0.4.0)*
- [x] **Echtes Marktplatz-Filter** (Zustand + Preis-Slider via Popover). *(v0.5.1)*
- [x] **Sorten-Farb-Coding** (Sativa=info/Indica=soil/Hybrid=leaf) konsistent umgesetzt. *(v0.5.0)*
- [x] **Grow-Report als PDF** (Browser-Druckansicht, offline). *(v0.9.0)*
- [x] **Währungs-/Sprach-Umschalter** (`I18nProvider` + `money()`/`t()`, Switcher in Settings). *(v0.9.1)*
- [x] **Offline-First**: IndexedDB-Wrapper (`lib/db.ts`), Social-Posts persistiert. *(v0.9.1)*
- [x] **Erweiterte AI-Agent-Workflows** (Mixture-of-Erd's: dynamischer Rezept-Diff). *(v0.9.1)*

## ♿️ Accessibility / Performance
- [x] **Focus-Trap** in Modals/Drawers/Sheets (`useFocusTrap`). *(v0.4.0)*
- [x] **Skip-to-Content-Link** am Seitenanfang. *(v0.4.0)*
- [x] **`role="list"`/`role="listitem"`** für Listen-Widgets (Forum-Kommentare, Aktivitätsfeed). *(v0.7.0)*
- [x] **`aria-live`** für Toasts & Streaming-Antworten (AI-Chat `role="log"`). *(v0.4.0/v0.5.0)*
- [x] **Bundle-Analyse** (`vite.analyze.config.ts` + `rollup-plugin-visualizer` → `bundle-stats.html`). *(v0.10.0)*
- [x] **Font-Subsetting**: Inter-Weights reduziert + Google css2 unicode-range-Subsets. *(v0.10.0)*

## 🧹 Code-Qualität
- [x] **`DataTable`-Komponente** extrahiert (generisch; Planner-Vergleichstabelle umgestellt). *(v0.5.0)*
- [x] **Popover-Komponente** ergänzt (`Popover` + `PopoverItem`, im Forum integriert). *(v0.4.2)*
- [x] **Showcase-Seite** (Design-System-Galerie der Komponenten-Bibliothek). *(v0.9.0)*
- [x] **Unit-Tests** (Vitest) für `format.ts` & Charts-`smooth` (Edge-Cases). *(v0.7.0)*
- [x] **ESLint/`tsc --noEmit`** in CI-Pipeline (`.github/workflows/ci.yml` + `eslint.config.js`). *(v0.10.0)*

## 📦 PWA / Deploy
- [x] **PNG-Icons** (192/512, any + maskable) generiert + im Manifest. *(v0.6.1)*
- [x] **Background-Sync** im Service Worker (`sync`-Tag `go-sync`, Online-Registrierung). *(v0.6.1)*
- [x] **`apple-touch-icon`** als PNG (192/512). *(v0.6.1)*
- [x] **Caching-Strategie** für remote Pexels-Bilder (SW stale-while-revalidate). *(v0.5.1)*

---

## ✅ Erledigt (Auswahl)
- [x] **Alle Sektionen abgearbeitet** 🎉 — Infrastruktur: Bundle-Analyse, ESLint + `tsc` in CI, Font-Subsetting. *(v0.10.0)*
- [x] **Features-Sektion komplett** (i18n/Währung, Offline-First/IndexedDB, Rezept-Diff). *(v0.9.1)*
- [x] **Grow-Report als PDF** (Druckansicht) + **Design-System-Showcase** + **`role="list"`**. *(v0.7.0/v0.9.0)*
- [x] **Community-Feed / Social-Media** (Stories, Compose, Posts, Like/Teilen/Merken, Follow, Trending). *(v0.8.0)*
- [x] **Unit-Tests (Vitest)** für `format.ts` & Charts-`smooth` + **`role="list"`** auf Listen. *(v0.7.0)*
- [x] **PWA/Deploy komplett** (PNG-Icons 192/512, maskable, apple-touch-icon PNG, Background-Sync, Bild-Caching). *(v0.5.1/v0.6.1)*
- [x] **Mobile/UX-Paket** (Pull-to-Refresh, Skeleton beim View-Wechsel, Lang-Druck-Menü, Bottom-Nav „Mehr"). *(v0.6.0)*
- [x] **Onboarding responsiv** (scrollbare Layer, Safe-Area, responsive Typo) + **Marktplatz-Filter** + **SW-Bild-Caching**. *(v0.5.1)*
- [x] **Accessibility-Paket** (Focus-Trap, Skip-Link, aria-live) + **Partikel-Toggle** + **Haptik**. *(v0.4.0)*
- [x] **Tote Schaltflächen interaktiv** (Planner-Auswahl mit State, NotFound, HallOfFame, Profile, Chat-Icons). *(v0.3.1)*
- [x] Mobile-Shell-Optimierung (TopBar, BottomNav, FAB, Safe-Area). *(v0.2.0)*
- [x] Modals/Notifications als Bottom-Sheets auf Mobile. *(v0.2.0/v0.3.0)*
- [x] Count-up, Swipe-Lightbox, Scroll-to-Top, Smart-Image. *(v0.2.0)*
- [x] Desktop-Sidebar-Overlap-Bugfix. *(v0.3.0)*
- [x] Doku-Set (README/CLAUDE/DESIGN/CHANGELOG/PROGRESS/TODO). *(v0.3.0)*

---

> **Dokumentation gepflegt von:** Claude (Anthropic) · Kennung `claude-grow-dev` · Stand 2026

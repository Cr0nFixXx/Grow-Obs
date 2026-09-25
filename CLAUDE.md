# CLAUDE.md

Anweisungen & Kontext für KI-Assistenten (und Entwickler), die an **Grow|Observer** arbeiten.
Diese Datei ist die „Source of Truth" für Konventionen, Architektur und Fallstricke.

## Aktuelle Prüfvorgaben

`HANDOFF.md` und `TESTING.md` haben Vorrang vor historischen Fertig-Meldungen. Ein Vite-Build ist
kein Typecheck und kein API-/Security-Test. Ergebnis nur als erfolgreich markieren, wenn der
Befehl tatsächlich lief. Node 22 verwenden; API wird separat geprüft. Keine gleichen Dateien
parallel ändern und keine Lint-Meldungen ungeprüft als "stale" abtun.

Backend-Tests: `npx vitest run --config vitest.backend.config.ts` aus dem Root, nur mit einer
disponiblen PostgreSQL-Datenbank auf `*_test`. Testlauf löscht Daten in dieser Testdatenbank.
Die CI beinhaltet nun einen separaten API-Job. Diese Session hat weder CI noch Docker gestartet.

Build-Stand: **B-42** — Next.js ist primärer Build (SPA-Hülle), Vite nur Legacy. `apps/api`
kompiliert, baut und besteht 13/13 Integrationstests; Docker weiterhin ungetestet (`HANDOFF.md` §9.1).
API-Tests liegen in `apps/api/tests/` und werden über `tsconfig.tools.json` mitgeprüft.
Autor: Codex (OpenAI).

---

## ⚙️ Build & Dev

```bash
npm run dev          # Next.js Dev-Server (primär)
npm run build        # Next.js Production-Build (inkl. TypeScript-Check)
npm run start        # Next.js Production-Server
npx next typegen     # Route-Typen erzeugen (vor tsc)
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint (inkl. react-hooks), CI-blockierend
npm test             # Vitest (Frontend)
npm run test:api     # API-Integrationstests (nur *_test-DB!)
npm run build:vite   # Vite-Legacy → dist/index.html (Single-File)
```

**Tests** (Vitest – nicht Teil des Production-Builds, separate Config `vitest.config.ts`):
```bash
npx vitest run    # Tests einmalig ausführen
npx vitest        # Watch-Modus
```
Abgedeckt: `format.ts` (eur/n/pct/clamp/timeAgo) & Charts-`smooth` (Edge-Cases). Test-Dateien
(`*.test.ts`) werden vom Vite-Build ignoriert (nicht in den App-Bundle importiert).

**Nur Vite-Legacy (`build:vite`):** Der Build ist ein **Single-File-Build** (`vite-plugin-singlefile`) – JS & CSS werden
in `dist/index.html` inlined. Assets aus `public/` werden **separat** emittiert und sind bei
reiner `index.html`-Auslieferung **nicht verfügbar**. Kritische, sichtbare Assets (z. B. der Hero)
daher **aus `src/` importieren** (werden base64-inlined), nicht aus `public/` referenzieren.

> `npm run build:vite` führt **kein** `tsc` aus (nur `vite build` / esbuild). Type-Fehler brechen den
> Build also nicht – saubere Typen dennoch pflegen. Lint-Hinweise bei Datei-Erstellung beachten.

---

## 🏗️ Architektur

- **Routing**: eigenes, leichtgewichtiges view-basiertes Routing (`src/lib/nav.tsx`,
  `NavProvider` + `useNav()`). Kein react-router (Single-File-tauglich). Views sind im `ViewKey`-Union
  typisiert; Detail-Seiten nutzen `params` (z. B. `{ growId }`) bei gleichem View-Schlüssel.
- **State**: UI-State (Theme, Navigation, Modals). Produktive Daten laufen über
  `src/data/hooks.ts` / `src/services`; direkte Mock-Imports nur für statische Demo-/Katalogdaten.
- **Jetzt:** PWA + Self-Host + Feature-Flags + Dev-Admin (`PLAN.md` P0b/P1).
- **Später:** Native, Editionen, E2EE — `MILESTONES.md` §0 (nicht in P0–P3).
- **Provider-Hierarchie** (`App.tsx`): `ThemeProvider > I18nProvider > AuthProvider > DataProvider > FeatureProvider > ToastProvider > NavProvider > Shell`.
- **Page-Transitions**: `AnimatePresence mode="wait"` keyed by `view` (in `App.tsx`).
- **Theming**: `<html data-theme="dark|light">` + Tailwind v4 `@theme inline` (semantische Tokens).
  no-FOUC via Inline-Script in `index.html`.

---

## 🧩 Konventionen

- **Styling**: Tailwind-Klassen mit semantischen Tokens (`bg-surface`, `text-fg-muted`, `text-accent`).
  Tone-Helfer aus `src/lib/tokens.ts` (`toneSoft`, `toneText`, `toneColor` …).
- **Icons**: Niemals lucide-Komponenten direkt in Loops/Maps verwenden → `<Icon name="..." />`
  (Registry in `src/components/Icon.tsx`). Neue Icons dort ergänzen.
- **Komponenten**: Wiederverwendbare UI in `src/components/ui.tsx`. Charts in `charts.tsx`.
  Animations-Helfer (`Reveal`, `StaggerGroup`, `CountUp`) in `motion.tsx`.
- **Bilder**: remote (Pexels) für Fotos; `SmartImage` für Shimmer-Placeholder; generierte Bilder
  **aus `src/assets` importieren**.
- **TypeScript-Strictness**: `noUnusedLocals`/`noUnusedParameters` aktiv → keine ungenutzten
  Imports/Variablen hinterlassen. `import type` für reine Typen.

---

## ⚠️ Fallstricke ( Lessons Learned)

1. **Custom Properties brauchen Einheiten!** `style={{ "--x": 272 }}` bleibt einheitslos und ergibt
   z. B. `padding-left: 272` (ungültig). React hängt bei Custom Properties **kein** `px` an
   (anders als bei echten Properties wie `width`). → immer `"${v}px"` setzen.
2. **`overflow-x: hidden` auf `body`** kann `position: sticky` brechen (body wird Scroll-Container).
   Lieber `overflow-x: clip` verwenden.
3. **Parallele Edits derselben Datei** sind riskant (Race-Conditions, kaputter Code). Edits an
   *derselben* Datei **sequenziell** ausführen; verschiedene Dateien dürfen parallel sein.
4. **`Math.min(...arr)`** crasht bei leeren Arrays → Charts hartieren (Guard `if (data.length === 0)`).
5. **`lg:pl-[var(--sb-w)]`** etc. als arbitrary values funktionieren, aber die Variable muss mit
   Einheit gesetzt sein (siehe #1).
6. **Mobile Overlays**: Dropdowns mit `right-0` am rechten Trigger laufen auf Mobile nach links
   über den Rand → auf Mobile Bottom-Sheets verwenden (`useMediaQuery`).
7. **Tailwind v4 scannt standardmäßig ALLE Projektdateien** (auch `*.md`, `apps/api/**`,
   `drizzle/*.sql`) → CSS wächst bei jeder Doku-Änderung. Deshalb steht in `src/index.css`
   `@import "tailwindcss" source(none);` plus `@source "."`, `"../index.html"`, `"../app"`.
   Neue UI-Ordner außerhalb `src/` dort registrieren, sonst fehlen Klassen stillschweigend.
9. **Bild-Imports** (`import x from "*.jpg"`): Vite = String, Next = `StaticImageData` → immer
   `assetSrc(x)` aus `src/lib/asset.ts`.
10. **Env:** `NEXT_PUBLIC_API_URL` wird zur Build-Zeit eingebettet (Vite-Legacy: `VITE_API_URL`).
8. **`npm run build:vite` prüft keine Typen**; kein Frontend-Build erfasst `apps/api`. Ein grüner
   Frontend-Build ist kein Beleg für eine funktionierende API.

---

## 🧠 Wann was tun

- **Neue Schnellaktion/Formular**: `src/config/create-kinds.ts` + Formular in `src/views/Create.tsx`.
- **Wischgesten**: `src/lib/gestures.ts` (`useSwipeToDismiss`, `useTabSwipe`); kein Framer `drag` auf
  scrollbaren Panels (setzt `touch-action: none`). Opt-out: `data-no-swipe` / `data-no-tab-swipe`.
- **Neuer Screen**: `ViewKey` in `nav.tsx` ergänzen, in `nav-config.ts` einordnen, View in
  `src/views/` (**nicht** `src/pages/` – in Next reserviert), in `App.tsx` `views`-Map + Import aufnehmen.
- **Neue Komponente**: zu `ui.tsx` (Primitives) oder eigenem File; `cn()` für Klassen-Merge nutzen.
- **Mock-Daten**: zentral in `mocks/data.ts`; **Typen** in `src/types/domain.ts` (Import über `@/types`).
- **Backend**: läuft eingebettet unter `/api` (`src/server/embedded-api.ts`). Neue API-Route in
  `apps/api/src/routes` genügt – kein Frontend-Proxy nötig. Relative Imports dort mit `.ts`-Endung.
- **Bilder**: Upload über `ImagePickButton`/`useImageUpload` (`src/components/media.tsx`); gespeicherte
  Pfade `/media/<id>` immer über `resolveMedia()` anzeigen (SmartImage/Avatar machen das automatisch).
- **Feature-Flags**: neuer Key → `src/config/features.ts` **und** `apps/api/src/lib/feature-keys.ts`
  (+ Pfad-Zuordnung in `apps/api/src/lib/features.ts`); Paritätstest schlägt sonst fehl.
- **Releases**: `package.json` `version` anheben; Neuigkeiten im Dev-Admin → „Updates“ veröffentlichen.
  Update-Erkennung läuft automatisch über die Build-ID (`/api/version`).
- **Aktueller Nutzer**: `useCurrentUser()` aus `@/lib/auth` – nie `currentUser` aus den Mocks.
- **npm**: Root-`.npmrc` (`legacy-peer-deps=true`) ist ein bewusster Workaround – nicht löschen.
- **Neuer Icon**: in `Icon.tsx` Registry ergänzen (Import + Record).
- **Bugfix**: in `PROGRESS.md` + `CHANGELOG.md` dokumentieren.

---

## 📚 Doku-Set

| Datei | Zweck |
|-------|-------|
| `README.md` | Überblick, Setup, Struktur |
| `CLAUDE.md` | Dieses Dokument – KI/Dev-Anweisungen |
| `DESIGN.md` | Design-System, Tokens, Bewegung |
| `ARCHITECTURE.md` | Backend-/Daten-Schicht (Service-Layer, Mock/API, REST) |
| `MIGRATION.md` | Next.js-Monorepo-Migration (Schritt-für-Schritt) |
| `HANDOFF.md` | Agent-Handoff (Ist-Stand, Fallstricke, DoD) |
| `PLAN.md` | Code-Phasen P0–P10: Monorepo, Backend, Funktionen |
| `MILESTONES.md` | Produkt-Nordstern: Editionen, Privacy, Native, Admin |
| `CHANGELOG.md` | Versionierter Änderungsverlauf |
| `PROGRESS.md` | Chronologische Code-Änderungen & Bugfixes |
| `TODO.md` | Offene Punkte & Vorschläge |
| `TESTING.md` | Regressionsprüfungen, CI, manuelle Abnahme, unbestätigte Checks |

---

> **Dokumentation gepflegt von:** Claude (Anthropic) · Kennung `claude-grow-dev` · Stand 2026

# CLAUDE.md

Anweisungen & Kontext für KI-Assistenten (und Entwickler), die an **Grow|Observer** arbeiten.
Diese Datei ist die „Source of Truth" für Konventionen, Architektur und Fallstricke.

---

## ⚙️ Build & Dev

```bash
npm run dev       # Vite Dev-Server
npm run build     # Production → dist/index.html (Single-File via vite-plugin-singlefile)
npm run preview   # Build vorschauen
```

**Tests** (Vitest – nicht Teil des Production-Builds, separate Config `vitest.config.ts`):
```bash
npx vitest run    # Tests einmalig ausführen
npx vitest        # Watch-Modus
```
Abgedeckt: `format.ts` (eur/n/pct/clamp/timeAgo) & Charts-`smooth` (Edge-Cases). Test-Dateien
(`*.test.ts`) werden vom Vite-Build ignoriert (nicht in den App-Bundle importiert).

**Wichtig:** Der Build ist ein **Single-File-Build** (`vite-plugin-singlefile`) – JS & CSS werden
in `dist/index.html` inlined. Assets aus `public/` werden **separat** emittiert und sind bei
reiner `index.html`-Auslieferung **nicht verfügbar**. Kritische, sichtbare Assets (z. B. der Hero)
daher **aus `src/` importieren** (werden base64-inlined), nicht aus `public/` referenzieren.

> `npm run build` führt **kein** `tsc` aus (nur `vite build` / esbuild). Type-Fehler brechen den
> Build also nicht – saubere Typen dennoch pflegen. Lint-Hinweise bei Datei-Erstellung beachten.

---

## 🏗️ Architektur

- **Routing**: eigenes, leichtgewichtiges view-basiertes Routing (`src/lib/nav.tsx`,
  `NavProvider` + `useNav()`). Kein react-router (Single-File-tauglich). Views sind im `ViewKey`-Union
  typisiert; Detail-Seiten nutzen `params` (z. B. `{ growId }`) bei gleichem View-Schlüssel.
- **State**: ausschließlich UI-State (Theme, Navigation, Modals). Keine echte Datenlogik.
  Alle Inhalte aus `src/mocks/data.ts`.
- **Provider-Hierarchie** (`App.tsx`): `ThemeProvider > ToastProvider > NavProvider > Shell`.
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

---

## 🧠 Wann was tun

- **Neuer Screen**: `ViewKey` in `nav.tsx` ergänzen, in `nav-config.ts` einordnen, Page in
  `src/pages/`, in `App.tsx` `views`-Map + Import aufnehmen.
- **Neue Komponente**: zu `ui.tsx` (Primitives) oder eigenem File; `cn()` für Klassen-Merge nutzen.
- **Mock-Daten**: zentral in `mocks/data.ts` inkl. Typen.
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
| `CHANGELOG.md` | Versionierter Änderungsverlauf |
| `PROGRESS.md` | Chronologische Code-Änderungen & Bugfixes |
| `TODO.md` | Offene Punkte & Vorschläge |

---

> **Dokumentation gepflegt von:** Claude (Anthropic) · Kennung `claude-grow-dev` · Stand 2026

# 🌿 Grow|Observer

**Jetzt:** funktionsfähige PWA-UI (React 19 + Vite + Tailwind v4) mit austauschbarer
Mock-/API-Service-Layer, Feature-Flags, Developer-Admin und Communities-MVP.

**Self-Host-Backend:** `apps/api` (Hono + Drizzle + PostgreSQL + MinIO + Docker Compose).
→ [`apps/api/README.md`](./apps/api/README.md)

**Später:** Native Apps, Editionen, E2EE/P2P. → [`MILESTONES.md`](./MILESTONES.md)

> Der aktive Frontend-Build ist weiterhin Vite. `VITE_API_URL` leer = Mock; gesetzt = Self-Host-API.
> Das Next.js-Skeleton ist vorbereitet, aber nicht der aktive Build.

**Status:** PWA + Backend-Fundament + Communities-MVP · **Agents:** [`HANDOFF.md`](./HANDOFF.md) · [`PLAN.md`](./PLAN.md) · [`MILESTONES.md`](./MILESTONES.md)

**Aktuelle Stabilisierung:** Backend-Startfehler und Zugriffsprüfungen korrigiert, private API-
Antworten aus dem PWA-Cache ausgeschlossen und Betreiberansichten an den Admin-Service angebunden.
Testdefinitionen sind ergänzt; deren Ausführung sowie Docker-/Browser-Abnahme stehen noch aus.
Prüfmatrix und Befehle: [`TESTING.md`](./TESTING.md). Kein Anspruch auf Produktionsreife.

Letzte Verifikation: **B-38**, Vite-Build erfolgreich; 862.56 kB HTML, 310.29 kB gzip.
Backend-/Tests-Laufzeitergebnisse dürfen daraus nicht abgeleitet werden.

---

## ✨ Highlights

- **Premium-„No-Slop"-Ästhetik**: Glassmorphism + soft Neumorphism, mehrstufige Elevation-Shadows, Glow-Akzente, Grain-Textur.
- **Vollständiges Light- & Dark-Theme** über CSS-Variablen mit sanftem Toggle-Übergang.
- **Mobile-First & responsiv** (sm/md/lg/xl/2xl): Sidebar (Desktop, kollaborierbar) + Bottom-Nav & FAB (Mobile) + Drawer.
- **Native Mobile-Patterns**: Modals werden auf Mobile zu Bottom-Sheets, Notifications als Slide-Up-Sheet, Swipe-Gesten in der Galerie, Safe-Area-Support (Notch & Home-Indikator).
- **Animationen mit Framer Motion**: Scroll-Reveals, Page-Transitions, Micro-Interactions, Count-up-Statistiken, Layout-Animationen.
- **Dezente Partikel** (Canvas, schwebende „Pollen/Sporen"), `prefers-reduced-motion`-respektierend.
- **Eigene SVG-Charts** (Area, Sparkline, Gauge, Donut, Bars) – leichtgewichtig, theme-aware & zuverlässig.
- **Smart-Image-Loading** mit Shimmer-Placeholder (Skeleton-Lader in Aktion bei echten Fotos).
- **Command-Palette (⌘K)**, Toaster, Notifications-Dropdown/Sheet, Modals, Drawers, Bottom-Sheets.

---

## 🧰 Tech-Stack

| Bereich      | Wahl                                              |
| ------------ | ------------------------------------------------- |
| Frontend     | React 19 + TypeScript + Vite                       |
| Styling      | Tailwind CSS v4 (CSS-Variablen/`@theme`)           |
| Animation    | Framer Motion                                     |
| Icons        | lucide-react                                       |
| Charts       | Eigenbau (SVG) – Recharts-frei & Single-File-tauglich |
| PWA          | `manifest.webmanifest` + `public/sw.js`           |
| API          | Hono + Node (`apps/api`)                           |
| DB / ORM     | PostgreSQL + Drizzle                              |
| Storage      | MinIO / S3-kompatibel                             |
| Auth         | JWT + Argon2                                      |

> **Warum keine Recharts?** Der Build nutzt `vite-plugin-singlefile`. Eine Chart-Lib würde das
> Single-File-Bundle massiv aufblähen. Die eigenen SVG-Charts sind klein, vollständig theme-bar
> und zu 100 % ausreichend für Mock-Visualisierungen.

---

## 🚀 Schnellstart

```bash
npm install      # Abhängigkeiten installieren
npm run dev      # Dev-Server (Vite)
npm run build    # Production-Build (Single-File: dist/index.html)
npm run preview  # Build lokal vorschau
```

Backend:

```bash
cd apps/api
cp .env.example .env
# JWT_SECRET, POSTGRES_PASSWORD und S3_SECRET_KEY eintragen (keine Default-Secrets).
docker compose up --build
```

API-Modus im Frontend:

```bash
VITE_API_URL=http://localhost:8787
```

---

## 📁 Projektstruktur

```
src/
├── App.tsx                  # Provider + View-Router + Page-Transitions + Onboarding
├── main.tsx                 # Entry + Service-Worker-Registrierung
├── index.css                # Design-Tokens (Tailwind v4 @theme) + Basis + Utilities
├── lib/
│   ├── theme.tsx            # ThemeProvider (Light/Dark, smooth toggle)
│   ├── nav.tsx              # Lightweights View-Routing (Context)
│   ├── hooks.ts             # useMediaQuery, useScrollProgress, useBodyScrollLock …
│   ├── format.ts            # eur(), pct(), timeAgo() …
│   └── tokens.ts            # Tone→Tailwind-Klassen-Mapping
├── mocks/
│   └── data.ts              # Alle zentralen Mock-Daten + Typen
├── components/
│   ├── ui.tsx               # Komponenten-Bibliothek (Button, Card, Modal, Tabs …)
│   ├── charts.tsx           # SVG-Charts (SeriesChart, Gauge, Donut, Bars, Sparkline)
│   ├── Icon.tsx             # Icon-Registry (String→lucide)
│   ├── Particles.tsx        # Canvas-Pollenfeld + Background (Aurora/Grain)
│   ├── Toast.tsx            # ToastProvider + useToast
│   ├── motion.tsx           # Reveal / Stagger / CountUp-Helfer
│   └── layout/
│       ├── AppShell.tsx     # Sidebar, TopBar, BottomNav, FAB, Drawer, CommandPalette, Notifications
│       └── nav-config.ts    # Navigations-Struktur
└── pages/                   # Screens inkl. Communities & Developer-Admin
apps/api/                    # Self-Host REST API + DB/Storage/Docker
public/
├── manifest.webmanifest
├── icon.svg
└── sw.js
```

### Dokumentation

| Datei | Zweck |
|-------|--------|
| [HANDOFF.md](./HANDOFF.md) | Agent-Einstieg, Fallstricke, DoD |
| [TESTING.md](./TESTING.md) | Ausführbare Prüfungen und offene Release-Gates |
| [PLAN.md](./PLAN.md) | Code-Phasen P0–P10 (Next, Backend, CRUD) |
| [MILESTONES.md](./MILESTONES.md) | Produkt-Nordstern: Editionen, Privacy, Native, Admin |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Service-Layer Mock/API |
| [apps/api/README.md](./apps/api/README.md) | Backend-Setup, Endpunkte, Sicherheit |
| [MIGRATION.md](./MIGRATION.md) | Vite → Next.js Monorepo |
| [DESIGN.md](./DESIGN.md) | Tokens, Komponenten, Bewegung |
| [CLAUDE.md](./CLAUDE.md) | Konventionen für KI-Agents |
| [CHANGELOG.md](./CHANGELOG.md) / [PROGRESS.md](./PROGRESS.md) | Historie |

---

## 🎨 Design-Tokens

Definiert in `src/index.css` über Tailwind v4 `@theme` und CSS-Variablen:

- **Farbskalen** (statisch): `leaf-*` (Grün), `soil-*` (Erd-/Terracotta), Status `warning/info/danger`.
- **Semantische Tokens** (theme-switchend): `--bg`, `--surface(-2/-3)`, `--fg(-muted/-subtle)`,
  `--border(-strong)`, `--accent`, `--accent-2`, Statusfarben → als Utilities nutzbar
  (`bg-surface`, `text-fg-muted`, `border-border`, `text-accent` …).
- **Radius-Skala** `--radius-sm … 3xl`, **Elevation** `.elev-1/2/3`, **Glow** `.glow`.
- **Effekt-Klassen**: `.glass`, `.neu`, `.neu-inset`, `.gradient-text`, `.grain`, `.shimmer`, `.animate-marquee`.

Theme-Umschaltung: `<html data-theme="dark|light">` (no-FOUC via Inline-Script in `index.html`).

---

## 📱 Responsive / Mobile

- **Mobile**: Bottom-Nav (4 Haupt-Tabs + „Mehr“), FAB, Scroll-to-Top, Swipe-Drawer.
- **Desktop**: persistente Sidebar (kollaborierbar), Top-Bar mit Suche.
- **Overlays**: Modal → auf Mobile Bottom-Sheet; Notifications → auf Mobile Slide-Up-Sheet.
- **Safe-Area**: `env(safe-area-inset-*)` auf TopBar, BottomNav, FAB, Content-Padding.
- **Touch**: Tap-Highlight entfernt, `touch-action: manipulation`, Card-`:active`-Feedback.
- **Gesten**: Drawer horizontal schließen, Sheets/Modals am Griff schließen, passiver Edge-Swipe,
  Long-Press mit Bewegungs-Guard, Pull-to-Refresh mit Overlay-/Formular-Guard.

---

## 🖥️ Screens

Dashboard · Auth (Split-Layout + Partikel-Hero) · Meine Grows (Liste + Detail mit Phasen-Timeline,
Umwelt-Charts, Masonry-Galerie + Lightbox, Logs) · Sorten-Sammlung (+ Detail-Modal) ·
Breeder & Seeds (Verzeichnis + Detail) · Marktplatz (Ticker + Grid + Detail) · Wiki (Bibliothek +
Reader, editierbar) · Forum (Feed + Thread/Kommentare) · Chat (Split + Live-Window) ·
Community-Feed (Social: Stories, Posts, Like/Teilen, Follow) · Communities (öffentlich/privat,
Invite-Code, Rollen) ·
Hall of Fame (Masonry-Showcase) · Kostenrechner (interaktiv) · Verbrauch (Charts + Vergleich) ·
Simulation (Wachstumskurven) · Grow-Planung (Vergleichstabelle) · Grow-Report (Export-UI) ·
KI-Assistent (Chat-Streaming + Agenten + Mixture-of-Erd's mit Git-Diff) · Benachrichtigungen ·
Profil & Einstellungen · Developer-Admin · Telegram-Integration · Onboarding/Splash · 404.

---

## ♿️ Qualität

- **Accessibility**: ARIA-Labels, Tastatur-Navigation (ESC schließt Overlays, ⌘K), sichtbare Focus-States, WCAG-AA-Kontraste.
- **Reduced Motion**: global respektiert; Partikel & Animationen werden deaktiviert/verkürzt.
- **Performance**: GPU-freundliche Animationen (`transform`/`opacity`), lazy Bilder, Shimmer-Placeholder, tabellarische Nummern.

---

## 📷 Bildmaterial

Stock-Fotos (Avatare, Pflanzenbilder) via **Pexels** (remote URLs, werden zur Laufzeit geladen).
Sorten-/Produkt-Cards nutzen CSS-Gradients + Icons, um das Bundle schlank zu halten.
Der atmosphärische Hero (Auth/Onboarding) ist eine KI-generierte, **inlined** JPG (`src/assets/hero.jpg`).

---

*Template-Demo – Inhalte sind fiktiv und dienen ausschließlich Präsentationszwecken. Kein Angebot zum Kauf von Cannabis.*

---

> Aktuelle Pflege: Codex (OpenAI), 2026. Frühere Signaturen sind historische Einträge.

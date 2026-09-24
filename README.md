# 🌿 Grow|Observer — Frontend-Design-Template

Ein **produktionsreifes Frontend/UI-Template** (keine Backend-Logik, nur Mock-Daten) für eine
Progressive Web App: ein community-getriebenes Cannabis-Grow-Dashboard mit persönlichem
Grow-Tagebuch, Kostenoptimierung, KI-Assistenz, Wiki, Forum und Marktplatz.

> Reines Design-System & UI/UX – alle Daten sind statisch (`src/mocks/data.ts`).
> State ist reiner UI-State (Theme, Navigation, Modals) – keine echte Geschäftslogik.

**Version:** `v0.3.0` · **Status:** stabil & build-validiert · **Pflege:** siehe [`PROGRESS.md`](./PROGRESS.md), [`CHANGELOG.md`](./CHANGELOG.md)

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
| Framework    | React 19 + TypeScript + Vite                       |
| Styling      | Tailwind CSS v4 (CSS-Variablen/`@theme`)           |
| Animation    | Framer Motion                                     |
| Icons        | lucide-react                                       |
| Charts       | Eigenbau (SVG) – Recharts-frei & Single-File-tauglich |
| PWA          | `manifest.webmanifest` + `public/sw.js`           |

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
└── pages/                   # 20+ Screens (Dashboard, Grows, AI, Wiki, Forum …)
public/
├── manifest.webmanifest
├── icon.svg
└── sw.js
```

Detaillierte Design-Entscheidungen: [`DESIGN.md`](./DESIGN.md) · Anweisungen für KI-Agenten: [`CLAUDE.md`](./CLAUDE.md)

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

- **Mobile**: Bottom-Nav (5 Tabs, animierter Indikator), FAB (rechts-unten), Scroll-to-Top, Slide-in-Drawer.
- **Desktop**: persistente Sidebar (kollaborierbar), Top-Bar mit Suche.
- **Overlays**: Modal → auf Mobile Bottom-Sheet; Notifications → auf Mobile Slide-Up-Sheet.
- **Safe-Area**: `env(safe-area-inset-*)` auf TopBar, BottomNav, FAB, Content-Padding.
- **Touch**: Tap-Highlight entfernt, `touch-action: manipulation`, Card-`:active`-Feedback.

---

## 🖥️ Screens

Dashboard · Auth (Split-Layout + Partikel-Hero) · Meine Grows (Liste + Detail mit Phasen-Timeline,
Umwelt-Charts, Masonry-Galerie + Lightbox, Logs) · Sorten-Sammlung (+ Detail-Modal) ·
Breeder & Seeds (Verzeichnis + Detail) · Marktplatz (Ticker + Grid + Detail) · Wiki (Bibliothek +
Reader, editierbar) · Forum (Feed + Thread/Kommentare) · Chat (Split + Live-Window) ·
Community-Feed (Social: Stories, Posts, Like/Teilen, Follow) ·
Hall of Fame (Masonry-Showcase) · Kostenrechner (interaktiv) · Verbrauch (Charts + Vergleich) ·
Simulation (Wachstumskurven) · Grow-Planung (Vergleichstabelle) · Grow-Report (Export-UI) ·
KI-Assistent (Chat-Streaming + Agenten + Mixture-of-Erd's mit Git-Diff) · Benachrichtigungen ·
Profil & Einstellungen · Telegram-Integration · Onboarding/Splash · 404.

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

*Template-Demo – Inhalte sind fiktiv und dienen ausschließlich Präsentationszwecken.*

---

> **Dokumentation gepflegt von:** Claude (Anthropic) · Kennung `claude-grow-dev` · Stand 2026

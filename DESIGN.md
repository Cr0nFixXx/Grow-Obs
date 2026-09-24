# DESIGN.md

Design-System-Dokumentation für **Grow|Observer** – Ästhetik, Tokens, Komponenten, Bewegung.

Stand der Admin-Überarbeitung: B-39 (Frontend-Build erfolgreich, Geräte-/Screenreader-Abnahme
offen), Codex (OpenAI). Für Sicherheits- und Prüfaussagen ist `TESTING.md` maßgeblich.

---

## 1. Design-Philosophie

**„No-Slop" Premium**: modern, aufgeräumt, mit Tiefe. Glassmorphism-Akzente treffen auf soft
Neumorphism, großzügiger Whitespace, klare Typo-Hierarchie. Warme, erdige Töne statt kalter Tech-Graus.

- **Primär-Akzent**: Naturgrün-Spektrum (frisches Blattgrün → tiefes Waldgrün)
- **Sekundär-Akzent**: Erdtöne/Braun (Soil, Terracotta)
- **Neutrale Basis**: warme Grautöne (Light) / tiefer Anthrazit (Dark)

---

## 2. Farb-Tokens (`src/index.css`)

### Statische Skalen (`@theme`)
- **Leaf (Grün):** `leaf-50 … leaf-950` (#edfcef → #082612)
- **Soil (Erd):** `soil-200 … soil-700`
- **Status:** `warning-400/500`, `info-400/500`, `danger-400/500`

### Semantische, theme-switchende Tokens (`@theme inline` → `:root` / `[data-theme=dark]`)
| Token | Nutzung |
|-------|---------|
| `--bg` | Seitenhintergrund |
| `--surface`, `--surface-2`, `--surface-3` | Karten / erhabene Flächen |
| `--fg`, `--fg-muted`, `--fg-subtle` | Text-Hierarchie |
| `--border`, `--border-strong` | Trennlinien |
| `--accent`, `--accent-2`, `--accent-fg` | Primär-/Sekundär-Akzent |
| `--success/--warning/--info/--danger` | Statusfarben |
| `--sh-1/2/3`, `--neu-*`, `--glass-*`, `--aurora-1/2` | Schatten/Neu/Glas/Atmosphäre |

Als Tailwind-Utilities: `bg-surface`, `text-fg-muted`, `border-border`, `text-accent`,
`bg-accent/12`, `text-leaf-500`, …

### Tone-Helfer (`src/lib/tokens.ts`)
`toneSoft / toneText / toneSolid / toneDot / toneColor` – maps `leaf|soil|info|warning|danger`
auf konsistente Klassen-Gruppen (für Badges, Icons, Akzente).

---

## 3. Typografie

- **Sans:** Inter (400–800) über Google Fonts
- **Display (Headlines):** Space Grotesk (500–700)
- Tabelle/Zahlen: `.tnum` (`font-variant-numeric: tabular-nums`)

---

## 4. Spacing · Radius · Elevation

- **Radius:** `--radius-sm .5rem` → `--radius-3xl 2.25rem`. Karten default `--radius-xl`.
- **Elevation (multi-layer soft):** `.elev-1` (subtil) → `.elev-3` (schwebend).
- **Glow:** `.glow` (grüner Akzent-Schein).
- **Effects:** `.glass` (backdrop-blur), `.neu` / `.neu-inset`, `.gradient-text`, `.grain`, `.shimmer`.

---

## 5. Komponenten-Bibliothek (`src/components/ui.tsx`)

Buttons (primary/secondary/ghost/outline/soil/danger/soft · sm/md/lg/icon) · IconButton · Card
(interactive, `card-hover`) · Badge · Chip · Avatar (status, ring) · Field/Input/Textarea/Select/
SearchInput · Toggle/Checkbox/Slider · Segmented · Tabs (underline/pill) · Accordion ·
ProgressBar · Meter · StatCard · RatingStars · Skeleton/SkeletonCard/SmartImage · Modal/Drawer/
BottomSheet · Spinner · EmptyState · Divider · PageHeader · Tooltip · Toast (Toast.tsx).

---

## 6. Bewegung (Framer Motion)

- **Easing:** `ease = [0.22, 1, 0.36, 1]` (CSS `--ease-spring`).
- **Scroll-Reveal:** `Reveal` (fade+rise, `whileInView once`) & `StaggerGroup/Item`.
- **Count-up:** `CountUp` (Ease-out-Cubic, rAF, `prefers-reduced-motion` → Endwert sofort).
- **Page-Transition:** `AnimatePresence mode="wait"`, keyed by view.
- **Layout-Indikatoren:** `layoutId`-Pills (Sidebar-Active, Bottom-Nav-Top-Indikator, Tabs).
- **Micro:** `whileTap` (Buttons), Card-`:active`-Scale, FAB/Modal-Springs.
- **Swipe:** Galerie-Lightbox per `drag="x"` + `dragSnapToOrigin`.
- **Marquee:** `.animate-marquee` (Seed-Ticker), pausiert bei Hover.

### `prefers-reduced-motion`
Global via CSS deaktiviert (Dauer → 0.001ms); Partikel rendern nicht; CountUp springt zum Zielwert.

---

## 7. Charts (SVG-Eigenbau, `src/components/charts.tsx`)

`SeriesChart` (Multi-Series Smooth-Area, `non-scaling-stroke`) · `Sparkline` · `Gauge` (radial) ·
`Donut` (Komposition) · `Bars` (CSS). Theme-Colors via `var(--accent)` etc. Hartiert gegen leere
Daten.

---

## 8. Responsive Patterns

| Breakpoint | Layout |
|------------|--------|
| **Mobile** (`<sm`) | TopBar (dauerhaft Burger + Brand + Search/Bell/Avatar), Bottom-Nav (4 + „Mehr"), FAB rechts, Drawer; Modals/Notifications = Bottom-Sheets; Safe-Area |
| **≥lg** | persistente Sidebar (kollaborierbar 272↔80px via `--sb-w`), Top-Bar mit Suche, zentrierter Content (`max-w-1440`) |

**Safe-Area:** `env(safe-area-inset-*)` auf TopBar/BottomNav/FAB/Content. **Touch:**
`-webkit-tap-highlight-color: transparent`, `touch-action: manipulation`.

**Touch B-41:** Drawer/Sheets/Modals haben Snapback; Drag startet in Sheet/Modal über den gesamten
Header (außer Controls), nicht über den Inhalt. Slider und Hauptaktionen nutzen mindestens 44 px.
Lightboxen unterstützen Flick/Swipe, Pull-to-Refresh hat Richtungs- und Overlay-Guards. Der Edge-
Swipe ist auf iOS deaktiviert, weil dort die System-Back-Geste Vorrang hat. Mobile Ticker sind
manuelle Snap-Carousels. Reale Geräte- und Bildschirmtastatur-Abnahme steht noch aus.

---

## 9. Atmosphäre

`Background` (`Particles.tsx`): fixierte Aurora-Gradients + Grain-Overlay + Canvas-Pollenfeld
(density skaliert mit Viewport, pausiert bei Tab-Wechsel, re-liest Akzent-Farbe bei Theme-Wechsel).

---

## 10. Desktop-Admin & Editionen (geplant)

Aktuell im Betreiberbereich: Health-Status wird als erreichbar / fehlgeschlagen / ungeprüft
unterschieden; Demo-Daten werden nicht als Servermessung dargestellt. Benutzeraktionen haben
44-px-taugliche Touch-Ziele und eine explizite Rollenänderungs-Bestätigung. Tabellenlastige
Inhalte sind für schmale Viewports als umbrechende Zeilen gestaltet. Ein lokales Sitzungsprotokoll
wird nicht als revisionssicheres Audit bezeichnet.

Siehe `MILESTONES.md`. Noch nicht im Code.

- **Density-Mode** (`data-density="compact"`) für Mod-/Admin-Tabellen auf `xl`.
- **Edition-Gates:** Nav-Punkte über `entitlements.*` ausblenden, nicht per hartem `if (edition === "pro")` verstreuen.
- Native App: Tokens (Farbe, Radius, Typo-Stufen) übernehmen; Komponenten **nicht** 1:1 aus `ui.tsx` (DOM) nach React Native kopieren.

---

> **Dokumentation gepflegt von:** Claude (Anthropic) · Kennung `claude-grow-dev` · Stand 2026

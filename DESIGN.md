# DESIGN.md

Design system of **Grow|Observer**: aesthetics, tokens, components, motion, responsive and touch patterns, plus the styling conventions and layout pitfalls.
Statements about security or test results live in `docs/TESTING.md`; architecture in `ARCHITECTURE.md`.

---

## 1. Philosophy

**"No-slop" premium:** modern and tidy, with depth. Glassmorphism accents meet soft neumorphism, generous whitespace, a clear type hierarchy. Warm, earthy tones instead of cold tech grey.

- **Primary accent:** natural green spectrum (fresh leaf green → deep forest green)
- **Secondary accent:** earth tones (soil, terracotta)
- **Neutral base:** warm greys (light) / deep anthracite (dark)
- Full light and dark theme via CSS variables with a smooth toggle; subtle grain texture and elevation shadows.

---

## 2. Color tokens (`src/index.css`)

### Static scales (`@theme`)
- **Leaf (green):** `leaf-50 … leaf-950` (#edfcef → #082612)
- **Soil (earth):** `soil-200 … soil-700`
- **Status:** `warning-400/500`, `info-400/500`, `danger-400/500`

### Semantic, theme-switching tokens (`@theme inline` → `:root` / `[data-theme=dark]`)

| Token | Use |
|---|---|
| `--bg` | page background |
| `--surface`, `--surface-2`, `--surface-3` | cards / raised surfaces |
| `--fg`, `--fg-muted`, `--fg-subtle` | text hierarchy |
| `--border`, `--border-strong` | dividers |
| `--accent`, `--accent-2`, `--accent-fg` | primary / secondary accent |
| `--success/--warning/--info/--danger` | status colors |
| `--sh-1/2/3`, `--neu-*`, `--glass-*`, `--aurora-1/2` | shadows / neumorphism / glass / atmosphere |

Use them as Tailwind utilities: `bg-surface`, `text-fg-muted`, `border-border`, `text-accent`, `bg-accent/12`, `text-leaf-500`, … Never hard-code hex colors in components.

Theme switching: `<html data-theme="dark|light">`, no FOUC thanks to an inline script in `app/layout.tsx`.

### Tone helpers (`src/lib/tokens.ts`)
`toneSoft / toneText / toneSolid / toneDot / toneColor` map `leaf|soil|info|warning|danger` to consistent class groups (badges, icons, accents). `Badge` has no neutral tone.

---

## 3. Typography

- **Sans:** Inter (400–700) via Google Fonts, subsetted by unicode range · **Display (headlines):** Space Grotesk (500–700)
- Tables/numbers: `.tnum` (`font-variant-numeric: tabular-nums`)

---

## 4. Spacing · radius · elevation · effects

- **Radius:** `--radius-sm .5rem` → `--radius-3xl 2.25rem`; cards default to `--radius-xl`.
- **Elevation (multi-layer, soft):** `.elev-1` (subtle) → `.elev-3` (floating). **Glow:** `.glow` (green accent glow).
- **Effects:** `.glass` (backdrop blur), `.neu` / `.neu-inset`, `.gradient-text`, `.grain`, `.shimmer`, `.animate-marquee`.

---

## 5. Component library (`src/components/ui.tsx`)

Button (primary/secondary/ghost/outline/soil/danger/soft · sm/md/lg/icon) · IconButton · Card (interactive, `card-hover`) · Badge · Chip · Avatar (status, ring; initials fallback via `initialsOf`) ·
Field/Input/Textarea/Select/SearchInput · Toggle/Checkbox (`role="checkbox"`)/Slider · Segmented · Tabs (underline/pill) · Accordion · ProgressBar · Meter · StatCard · RatingStars ·
Skeleton/SkeletonCard/SmartImage · Modal/Drawer/BottomSheet · SwipeLightbox · Popover/PopoverItem (`aria-haspopup="menu"`) · DataTable · Spinner · EmptyState · Divider · PageHeader · Tooltip.
Toasts: `Toast.tsx` (`ToastProvider`, `useToast`). Feature components: `src/components/` (`CommentsSheet`, `SessionsCard`, `AccountSecurity`, `NewChat`, `UpdateUI`, `community/*`).

### Conventions

- **Styling:** Tailwind classes with semantic tokens (above); merge classes with `cn()` (`src/utils/cn.ts`).
- **Icons:** never use lucide components directly in loops/maps – use `<Icon name="…" />` and register new icons in `src/components/Icon.tsx` (import + record).
- **Components:** reusable UI goes into `ui.tsx` (primitives) or its own file; charts in `charts.tsx`; animation helpers in `motion.tsx`.
- **Images:** remote photos (Pexels) through `SmartImage` (shimmer placeholder, gradient + icon on error); generated images are **imported from `src/assets`** and rendered through `assetSrc()` (`src/lib/asset.ts`: Vite gives a string, Next a `StaticImageData`).
  Uploaded `/media/<id>` paths go through `resolveMedia()` (SmartImage/Avatar do it automatically). Always give `Avatar` a `name`.
- **Honest UI:** no invented numbers or people in API mode – show real data or an `EmptyState` with an explanation.
- **TypeScript:** `noUnusedLocals`/`noUnusedParameters` are on; use `import type` for pure types.
- **Modals:** a `BottomSheet` must not be nested in another one; on mobile `Modal` becomes a bottom sheet automatically.

---

## 6. Motion (Framer Motion)

- **Easing:** `ease = [0.22, 1, 0.36, 1]` (CSS `--ease-spring`).
- **Scroll reveal:** `Reveal` (fade + rise, `whileInView once`) and `StaggerGroup/StaggerItem`.
- **Count-up:** `CountUp` (ease-out cubic, rAF; `prefers-reduced-motion` → final value immediately).
- **Page transition:** `AnimatePresence mode="wait"`, keyed by view.
- **Layout indicators:** `layoutId` pills (sidebar active, bottom-nav indicator, tabs). **Micro:** `whileTap` (buttons), card `:active` scale, FAB/modal springs.
- **Swipe:** gallery lightbox via `drag="x"` + `dragSnapToOrigin`. **Marquee:** `.animate-marquee` (seed ticker), pauses on hover.
- **`prefers-reduced-motion`:** disabled globally via CSS (duration → 0.001 ms); particles do not render; CountUp jumps to the target.

---

## 7. Charts (hand-made SVG, `src/components/charts.tsx`)

`SeriesChart` (multi-series smooth area, `non-scaling-stroke`) · `Sparkline` · `Gauge` (radial) · `Donut` · `Bars` (CSS). Colors via `var(--accent)` etc.; guarded against empty data (`Math.min(...[])` crashes).
Why no chart library: the legacy build is a single file (`vite-plugin-singlefile`); a library would bloat the bundle, and the SVG charts are small, theme-aware and sufficient.

---

## 8. Responsive and touch patterns

| Breakpoint | Layout |
|---|---|
| **Mobile** (`<sm`) | TopBar (permanent burger + brand + search/bell/avatar), bottom nav (4 tabs + "Mehr" sheet), FAB bottom right, drawer; modals and notifications become bottom sheets; safe areas |
| **≥ lg** | persistent sidebar (collapsible 272 ↔ 80 px via `--sb-w`), top bar with search, centered content (`max-w-1440`) |

- **Safe area:** `env(safe-area-inset-*)` on TopBar, BottomNav, FAB and content padding. **Touch:** `-webkit-tap-highlight-color: transparent`, `touch-action: pan-x pan-y` (no pinch/double-tap zoom, B-67), `user-select: none` except inputs (B-68), card `:active` feedback, targets ≥ 44 px.
- **Gestures:** drawer closes horizontally, sheets/modals follow the finger and snap back when cancelled, passive edge swipe (off on iOS), long-press with a movement guard, pull-to-refresh with overlay/form guard.
  Rules and do-not-roll-back details: `HANDOFF.md` §4. Lightboxes support flick/swipe; mobile tickers are manual snap carousels. Real-device and on-screen-keyboard acceptance is still open (`docs/TESTING.md`).
- **Command palette** (⌘K), skip link, focus traps in modals/drawers/sheets, `aria-live` for toasts and streamed answers, visible focus states, WCAG-AA contrasts.

---

## 9. Atmosphere

`Background` (`Particles.tsx`): fixed aurora gradients + grain overlay + canvas pollen field (density scales with the viewport, pauses on tab switch, re-reads the accent color on theme change).

---

## 10. Layout and CSS pitfalls

1. **Custom properties need units.** `style={{ "--x": 272 }}` stays unitless (React adds no `px`) → always `"${v}px"`; the same applies to arbitrary values such as `lg:pl-[var(--sb-w)]`.
2. **`overflow-x: hidden` on `body`** can break `position: sticky` (body becomes the scroll container) → use `overflow-x: clip`.
3. **Mobile overlays:** `right-0` dropdowns on a right-hand trigger overflow to the left on mobile → use bottom sheets (`useMediaQuery`).
4. **Tailwind v4 scans every project file** (also `*.md`, `apps/api/**`, `drizzle/*.sql`), so CSS grows with every doc change. `src/index.css` therefore uses `@import "tailwindcss" source(none);`
   plus `@source "."`, `"../index.html"`, `"../app"` (test files excluded). **New UI folders outside `src/` must be registered there**, otherwise classes silently disappear.
5. **PostCSS/Tailwind setup:** CSS-based config in `src/index.css`, no `tailwind.config.js`; the root `postcss.config.mjs` is for Next only – `vite.config.ts` keeps `css.postcss` inline, otherwise Vite processes Tailwind twice.
   No folder named `pages/` in `src/` or the root (Next pages router).
6. Register new string icons in `src/components/Icon.tsx`.

---

## 11. Admin UI and planned work

**Implemented (operator area):** health shown as reachable / failed / unchecked (demo data is never presented as a server measurement), 44 px touch targets, explicit confirmation for role changes,
table-heavy content wraps into rows on narrow viewports, the local session log is not called an audit trail.

**Planned, not in code** (`docs/MILESTONES.md`):
- **Density mode** (`data-density="compact"`) for moderation/admin tables on `xl`.
- **Edition gates:** hide navigation entries via `entitlements.*` instead of scattering hard `if (edition === "pro")` checks.
- **Native app:** reuse the tokens (color, radius, type scale); do **not** copy components 1:1 from `ui.tsx` (DOM) to React Native.

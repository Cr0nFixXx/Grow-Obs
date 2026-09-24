# HANDOFF.md

**Für:** Claude Code, OpenCode, Codex, Hermes und andere Coding-Agents  
**Projekt:** Grow|Observer  
**Stand:** Frontend B-33 (Vite Single-File, grün) + Backend-Grundgerüst `apps/api`  
**Sprache der UI:** Deutsch  
**Vorheriger Agent:** `claude-grow-dev` (Claude · Anthropic)

Lies **dieses Dokument zuerst**, dann `PLAN.md`. `MILESTONES.md`: **PWA-first** oben, Native/Editionen unten (zurückgestellt). Nicht raten — die Fallstricke unten sind echt.

---

## 1. Was das Projekt IST

Ein **produktionsreifes Frontend-Design-Template** (React 19 + Vite + Tailwind v4 + TypeScript) für eine Community-Cannabis-Grow-PWA.

- Alle 22 Screens existieren und sind visuell vollständig.
- **Service-Layer verdrahtet:** Core-Pages (Grows, Social, Forum, Chat, Wiki, Notifications,
  Marketplace, Breeders, Hall, Planner, Report, Profile, Dashboard) laufen über `src/data/hooks.ts`.
  Statische Katalog-/Ableitungsdaten bleiben Mock-Imports.
- **Auth-Gate** aktiv (ungeloggte Views zeigen Auth); `useAuth()` liefert die Session.
- **Backend-Grundgerüst vorhanden:** `apps/api` (Hono + Drizzle + PostgreSQL + MinIO), REST-Vertrag
  exakt passend zum Frontend. Start via `apps/api/docker-compose.yml`. Details: `apps/api/README.md`.
- Frontend schaltet über `VITE_API_URL` (leer = Mock) um — `src/lib/config.ts` + `src/services/api.ts`.
- Next.js-Skeleton existiert (`app/`, `next.config.js`, `pnpm-workspace.yaml`) — **aktiver Build ist Vite**.

**Ziel jetzt:** Backend live bringen (Docker), Frontend auf `VITE_API_URL` umschalten, dann
Communities/Realtime ausbauen (`PLAN.md` P4 → P5).

**Zurückgestellt:** Native, Editionen, P2P/E2EE-Gerätecloud (`MILESTONES.md` ab §0).

---

## 2. Sofort starten

**Frontend (aktiver Build):**
```bash
npm install
npm run dev          # Vite Dev-Server (aktueller aktiver Stack)
npm run build        # Single-File → dist/index.html (MUSS grün bleiben, solange Vite aktiv ist)
npx vitest run       # Unit-Tests (format.ts + charts.smooth)
npx tsc --noEmit     # Typecheck (nicht im npm-script, aber in CI)
```

**Backend (selbst gehostet):**
```bash
cd apps/api
cp .env.example .env   # JWT_SECRET anpassen
docker compose up --build   # Postgres + MinIO + API auf :8787
```

Frontend auf das Backend umschalten: in der Vite-Env `VITE_API_URL=http://localhost:8787` setzen
(leer = Mock-Modus). CORS-Origins in `apps/api/.env` unter `CORS_ORIGINS` pflegen.

---

## 3. Tech-Stack (IST)

| Schicht | Ist |
|---|---|
| UI | React 19.2, TypeScript 5.9, Vite 7, Tailwind CSS **v4** (`@tailwindcss/vite`) |
| Animation | Framer Motion |
| Icons | lucide-react via `src/components/Icon.tsx` Registry |
| Charts | Eigenbau SVG (`src/components/charts.tsx`) — **kein Recharts** |
| Routing | View-State Context `useNav()` (`src/lib/nav.tsx`) — **kein react-router, kein Next-Router** |
| State | Nur UI-State (Theme, Nav, Modals). Kein Redux/Zustand/TanStack Query |
| PWA | `public/manifest.webmanifest`, `public/sw.js`, PNG-Icons 192/512 |
| Tests | Vitest (`vitest.config.ts`), Dateien `*.test.ts` |
| Lint | ESLint flat config (`eslint.config.js`) |
| CI | `.github/workflows/ci.yml` (tsc + eslint + vitest + build) |

**Abhängigkeiten in `package.json`:** react, react-dom, framer-motion, lucide-react, clsx, tailwind-merge, vitest, eslint, typescript-eslint. **Kein Next.js installiert.** `next.config.js` existiert, aber `next` ist **kein** dependency.

---

## 4. Projektstruktur (wichtigste Pfade)

```
src/
  App.tsx                 # "use client" + Provider-Hierarchie + View-Router
  pages/                  # 22 Screens (Dashboard, Grows, Social, AI, …)
  components/
    ui.tsx                # ALLE Primitives (groß)
    charts.tsx            # SVG-Charts
    layout/AppShell.tsx   # Sidebar, TopBar, BottomNav, FAB, Drawer, CommandPalette
    layout/nav-config.ts  # Nav-Gruppen
    Icon.tsx              # String→Lucide Registry — neue Icons HIER eintragen
    Particles.tsx         # Canvas-Pollen + Background
    Toast.tsx
    motion.tsx            # Reveal, Stagger, CountUp
  lib/
    nav.tsx               # ViewKey + navigate(view, params)
    theme.tsx             # Light/Dark + particles toggle
    i18n.tsx              # de/en + EUR/USD (nur Settings verdrahtet)
    auth.tsx              # AuthProvider (Mock + API-Pfad)
    api.ts                # HTTP-Client + ApiError + setAuthToken
    config.ts             # useMock = !VITE_API_URL
    db.ts                 # IndexedDB KV (dbGet/dbSet/dbDel)
    hooks.ts              # media, scroll, focus-trap, PTR, long-press, …
    format.ts             # eur, pct, timeAgo, vibrate
    tokens.ts             # Tone-Klassen (leaf/soil/info/warning/danger)
  services/
    interfaces.ts         # GrowService, SocialService, StrainService
    mock.ts / api.ts / index.ts
  data/
    DataContext.tsx       # DataProvider + useServices()
    hooks.ts              # useGrows, useStrains, useSocialPosts
  mocks/data.ts           # ALLE Mock-Daten + Typen
  types/index.ts          # Re-export + User + Create*Input
  index.css               # Design-Tokens (Tailwind v4 @theme)

app/                      # Next.js Skeleton (Vite ignoriert das)
  layout.tsx / page.tsx   # page.tsx: dynamic(() => import("@/App"), { ssr: false })
public/                   # PWA + Icons
docs: README, CLAUDE, DESIGN, ARCHITECTURE, MIGRATION, CHANGELOG, PROGRESS, TODO
```

Provider-Hierarchie (`App.tsx`):

```
ThemeProvider → I18nProvider → AuthProvider → DataProvider → ToastProvider → NavProvider → Shell
```

---

## 5. Screens / ViewKeys

Alle in `src/lib/nav.tsx` `ViewKey` und `src/App.tsx` `views`-Map:

`dashboard` `grows` `strains` `ai` `planner` `breeders` `marketplace` `wiki` `forum` `hallOfFame` `social` `showcase` `calculator` `consumption` `simulation` `report` `chat` `notifications` `profile` `telegram` `auth`

Detail-Params (gleicher View, andere Params): `growId`, `breederId`, `threadId`, `articleId`.

Mobile Bottom-Nav: Home, Grows, Forum, Profil + **„Mehr"-Sheet** (Marktplatz, KI, Wiki, HoF, Social, Chat, Rechner, Showcase).

---

## 6. Was BEREITS fertig ist (nicht neu bauen)

- Vollständiges Design-System (Light/Dark, Tokens, Glass, Charts, Overlays)
- Alle Screens als UI mit Mock-Daten
- PWA (Manifest, SW mit SWR für Bilder, Background-Sync Tag `go-sync`, PNG-Icons)
- Accessibility: Focus-Trap, Skip-Link, aria-live, role=list, reduced-motion
- Mobile: PTR, Skeleton-Flash, Long-Press (HoF), Auto-Hide-Scrollbar, Bottom-Sheets
- i18n-Grundgerüst (`t()`, `money()`) — **nur Profile-Settings verdrahtet**
- Service-Layer + Auth-Provider + HTTP-Client — **Pages nutzen das fast nicht**
- IndexedDB: Social-Posts in `Social.tsx` UND in `services/mock.ts` (doppelte Persistenz — vereinheitlichen)
- Next.js Skeleton + `MIGRATION.md` + `ARCHITECTURE.md`
- Tests: `src/lib/format.test.ts`, `src/components/charts.test.ts`
- TODO.md ist **100 % abgehakt** (Template-Scope). Offene Arbeit steht in `PLAN.md`.

---

## 7. Was NICHT fertig ist (echte Arbeit)

1. Pages importieren weiter `from "@/mocks/data"` statt `useGrows()` / `useSocialPosts()`.
2. Service-Interfaces decken nur **3 Domänen** ab (grows, social, strains). Rest fehlt.
3. Auth-UI (`pages/Auth.tsx`) ruft **nicht** `useAuth().login()` — nur Toast + navigate.
4. Next.js ist Skeleton, `next` ist nicht in dependencies, kein File-based Routing.
5. Kein Backend, keine DB, kein Storage, kein Realtime, kein AI-Backend.
6. Keine echte Telegram-Bot-Anbindung.
7. PDF-Export = `window.print()`, kein serverseitiges PDF.
8. Chat / Forum / Notifications sind rein lokal/UI.

---

## 8. Harte Constraints & Fallstricke

Agents **müssen** das beachten. Verstöße brechen den Build oder die UX.

### Tailwind v4
- Config ist **CSS-basiert** (`src/index.css` `@import "tailwindcss"`, `@theme`, `@theme inline`).
- **Kein** `tailwind.config.js`. Semantische Farben: `bg-surface`, `text-fg-muted`, `text-accent`, `border-border`.
- Dark Mode: `html[data-theme="dark"]` + `@custom-variant dark`.

### Custom CSS-Properties brauchen Einheiten
```ts
// FALSCH — padding-left: 272 ist ungültig
style={{ "--sb-w": 272 }}
// RICHTIG
style={{ "--sb-w": "272px" }}
```
React hängt bei Custom Properties **kein** `px` an. Das war ein echter Desktop-Sidebar-Overlap-Bug.

### `overflow-x: hidden` auf body bricht sticky
Aktuell `overflow-x: clip`. Nicht zurückändern.

### Icons
Niemals Lucide-Komponenten in Loops per String. Registry `src/components/Icon.tsx` erweitern, dann `<Icon name="Foo" />`.

### Single-File Vite-Build
`vite-plugin-singlefile` inlined JS/CSS in `dist/index.html`. Assets aus `public/` bleiben **separate Dateien**. Sichtbare kritische Bilder aus `src/` importieren (werden base64). **Kein Recharts** (Bundle-Bloat).

### PostCSS
**Kein** `postcss.config.mjs` im Root anlegen, solange Vite der aktive Build ist. Vite lädt es und crasht ohne `@tailwindcss/postcss`. Next.js-PostCSS gehört nach `apps/web/` (siehe `MIGRATION.md`).

### `"use client"`
Steht in `App.tsx` für Next.js. Vite ignoriert es. Beibehalten.

### Parallele Same-File-Edits
Nicht dieselbe Datei in parallelen Tool-Calls editieren — erzeugt Race-Conditions/kaputten Code.

### `noUnusedLocals` / `noUnusedParameters`
tsconfig ist strict. Ungenutzte Imports zerbrechen `tsc --noEmit`.

### Canvas / window / IndexedDB
Kein SSR. Next.js-Pages, die die SPA einbinden, brauchen `dynamic(..., { ssr: false })` (bereits in `app/page.tsx`).

### Mobile TopBar
Dauerhaft **Burger-Menü**, kein Back-Button in der TopBar. Zurück nur über PageHeader der Detail-Pages oder Nav.

---

## 9. Konventionen (weiterführen)

- UI-Sprache Deutsch. Code-Kommentare Deutsch oder Englisch, konsistent.
- Neue Domäne: Pattern in `ARCHITECTURE.md` (Typ → Interface → mock.ts → api.ts → Hook → Page).
- Navigation: solange Vite aktiv ist, `useNav().navigate("grows", { growId })`. Nach Next.js: `router.push("/grows/[id]")`.
- Toasts: `useToast().push({ title, desc?, tone, icon })`.
- Haptik: `vibrate()` aus `src/lib/format.ts`.
- Doku nach erfolgreichem Build aktualisieren: `CHANGELOG.md`, `PROGRESS.md`. Signatur: Agent-Name + Datum.

---

## 10. Definition of Done (für JEDE Änderung)

1. `npm run build` grün, solange Vite der aktive App-Build ist.
2. `npx tsc --noEmit` grün.
3. `npx vitest run` grün.
4. Keine ungenutzten Imports.
5. Mobile + Desktop nicht regressieren (Sidebar-Padding, Bottom-Nav, Safe-Area).
6. CHANGELOG + PROGRESS um den Build ergänzen.

Wenn du auf Next.js umgestellt hast: Vite-Build darf entfallen, dann `next build` ist DoD.

---

## 11. Empfohlene Lesereihenfolge

1. **dieses File** (`HANDOFF.md`)
2. `PLAN.md` — nächste Code-Phasen (P0–P10)
3. `MILESTONES.md` — Produkt-Nordstern (Editionen, Privacy, Native)
4. `ARCHITECTURE.md` — Service-Layer
5. `MIGRATION.md` — Next.js / Monorepo
6. `CLAUDE.md` — Konventionen / Fallstricke
7. `DESIGN.md` — Tokens / Komponenten
8. `src/services/interfaces.ts` + `src/lib/nav.tsx` + `src/App.tsx`

---

## 12. Kontakt zum Ist-Zustand in einem Satz

> **UI ist fertig und poliert. Daten sind Fake. Service-Layer und Next-Skeleton liegen bereit, sind aber nicht die laufende App. Nächster Job: Pages auf Services (P1), dann Monorepo/Next/Backend. Nordstern Native + E2EE-Communities steht in MILESTONES.md — erst nach M3.**

---

> Handoff erstellt von `claude-grow-dev` (Claude · Anthropic) · 2026

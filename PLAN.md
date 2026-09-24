# PLAN.md

**Für:** Claude Code, OpenCode, Codex, Hermes  
**Projekt:** Grow|Observer  
**Lies zuerst:** `HANDOFF.md` · Produkt-Nordstern: `MILESTONES.md`

Dieses Dokument ist der **ausführbare Plan**. Arbeite Phasen in Reihenfolge. Eine Phase gilt erst als done, wenn ihre Acceptance Criteria erfüllt sind. Nicht mehrere Phasen parallel „ungefähr“ anschneiden.

---

## 0. Zielbild

```
pnpm-workspace
├── apps/web          Next.js 15 App Router (PWA, Desktop-optimiert)
├── apps/mobile       Expo (Android zuerst, später iOS) — ab M7
├── apps/api          nur bei Host-Variante C
└── packages/
    ├── ui            Web-Komponenten
    ├── shared        Types, entitlements, services, lib
    ├── sync          Event-Log, Tombstones, E2EE (Paid, ab M5)
    └── config        eslint / tsconfig presets
```

**Produkt (nahe):** Community-Grow-PWA mit echtem Account, Grow-Tagebuch, Feed, Forum, Chat, Wiki — Daten persistent, Auth echt.

**Produkt (Nordstern):** Native Android/iOS, Editionen Free/Pro/CSC/Enterprise, E2EE-Communities, local-first außer Free-Cloud. Details und Reihenfolge: **`MILESTONES.md`**.

**Jetzt (verbindlich):** voll funktionsfähige **PWA** + **selbst gehostetes** Backend (Communities, AI, Speicher). Feature-Flags (Datei → später Dev-Admin). Developer-Admin für Betreiber.

**Zurückgestellt:** Native Apps, Editionen Free/Pro/CSC/Enterprise, P2P/E2EE-Gerätecloud — siehe `MILESTONES.md` §0, nicht vor PWA-Launch.

**Nicht-Ziele in Phase 1–3:** Native Apps, P2P-Mesh, IAP/Editionen, Multi-Region.

---

## 1. Host- & Backend-Entscheidung (ZUERST festlegen)

Treffe **eine** Variante und schreibe sie oben in dieses File unter „Beschlossen:“. Nicht mischen.

### Variante A — Empfohlen: Next.js Full-Stack (ein Deploy)

| | |
|---|---|
| **Web** | `apps/web` Next.js 15 auf **Vercel** (oder Coolify/Fly) |
| **API** | Next.js Route Handlers `app/api/**` + Server Actions |
| **DB** | **PostgreSQL** (Neon oder Supabase Postgres) |
| **ORM** | **Drizzle** (typisiert, schlank) oder Prisma |
| **Auth** | **Auth.js (NextAuth v5)** — Credentials + optional Telegram later |
| **Storage** | **Cloudflare R2** oder S3-compatible (Grow-Fotos, Avatare) |
| **Realtime** | **Postgres LISTEN** oder Supabase Realtime; Chat: später Socket.io auf separatem Worker |
| **AI** | OpenAI/Anthropic API hinter Server-Route, Keys nie im Client |
| **Jobs** | Vercel Cron / Inngest (Reports, Digests, Seed-Ticker) |
| **PWA** | `@ducanh2912/next-pwa` oder Serwist; SW aus `public/sw.js` portieren |

**Warum A:** Ein Repo, ein Deploy, Types end-to-end, passt zum bestehenden `http`-Client (`/grows`, `/auth/login`, …). Agent-Komplexität niedrig.

### Variante B — Supabase-Backend

Auth + Postgres + Storage + Realtime out of the box. Next.js bleibt Frontend. Service-Layer `api.ts` spricht Supabase JS **oder** bleibt REST via Edge Functions.

Gut wenn Realtime/Chat schnell gebraucht wird. Schlechter Fit wenn ihr Vendor-Lock vermeiden wollt.

### Variante C — Separates API-Paket (`apps/api`)

Hono oder Nest auf Fly/Railway + Postgres. `apps/web` bleibt reines Frontend. Nur wählen, wenn mehrere Clients (mobile later) die gleiche API brauchen.

### Beschlossen

```
Variante:     Self-Host (A Full-Stack auf VPS/Coolify ODER C: Web + API in Docker)
Hosting:      Eigener Server (Docker-Compose: App, Postgres, MinIO, optional Redis)
DB:           PostgreSQL (selbst)
Storage:      MinIO (S3-kompatibel, selbst) — später beliebig S3
Auth:         Auth.js Credentials oder eigene JWT-API; Telegram später
AI:           Provider-API nur serverseitig
Flags:        src/config/features.ts (File) → Overrides im Dev-Admin
Dev-Admin:    Plattform-Betreiber, Rolle platform_admin
```

SaaS (Vercel/Neon) bleibt **optional**, nicht Default.

---

## 2. Phasen-Übersicht

| Phase | Name | Ergebnis | Abhängigkeit |
|------|------|----------|--------------|
| P0 | Guardrails | Vite-App bleibt grün, Docs aktuell | — |
| P1 | Pages → Services | UI spricht nur noch Hooks/Services | P0 |
| P2 | Monorepo + Next.js | `apps/web` startet, Vite optional | P1 |
| P3 | File-based Routing | `useNav` tot, URLs echt | P2 |
| P4 | Backend-Fundament | ✅ `apps/api` (DB, Auth, Storage, CRUD, Docker) — vorausbauend, unabhängig von Next | — |
| P5 | Communities & Realtime | Follows, Communities/Invites, SSE/WS, Presence | P4 |
| P6 | Social Graph | Feed, Follow, Likes | P5 |
| P7 | Community | Forum, Chat, Notifications, Wiki | P6 |
| P8 | Commerce & Tools | Marktplatz, Calculator persist, Report PDF | P5 |
| P9 | AI | Echter Assistent + Recipe-Diff persist | P5 |
| P10 | Harden | Tests, Observability, PWA, Launch | P7–P9 |
| P11 | Entitlements | Feature-Flags Free/Pro/CSC/Enterprise (UI-Gates) | P1 |
| P12 | Local-first + E2EE | `packages/sync`, Tombstones, untrusted Relay | P5 + P11 |
| P13 | Native Android | `apps/mobile` Expo MVP | P12 |
| P14 | Stores + IAP | Play/TestFlight Gates, RevenueCat/Stripe | P13 |

P11–P14 sind in **`MILESTONES.md` (M1, M5–M9)** spezifiziert. Nicht vor P1 beginnen.

Host-Variante A bleibt für **Free-Edition-Cloud** richtig. Paid-Editionen nutzen dieselbe Web-App, aber **keinen Klartext-S3**; Sync = Ciphertext-Relay (M5).

Jede Phase: **kleine PRs**, nach jeder: Tests + Build + CHANGELOG-Eintrag.

---

## P0 — Guardrails (½ Tag)

**Ziel:** Nichts kaputt machen, während Architektur wechselt.

### Tasks
1. `npm run build && npx tsc --noEmit && npx vitest run` — Baseline grün halten.
2. Kein `postcss.config.mjs` im **Repo-Root** (bricht Vite). Next-PostCSS nur in `apps/web/`.
3. `HANDOFF.md` Fallstricke befolgen (Custom Props + `px`, Icon-Registry, `overflow-x: clip`).

### Done wenn
- Vite-Build weiterhin grün.
- Self-Host als Default akzeptiert (nicht Vercel-Pflicht).

---

## P0b — Feature-Flags + Developer-Admin (½–1 Tag)

**Ziel:** Unfertige Funktionen abschaltbar; Betreiber-Bereich existiert als UI.

### Tasks
1. `src/config/features.ts` — boolean map (auth, grows, social, communities, forum, chat, wiki, marketplace, ai, telegram, calculator, hallOfFame, devAdmin, …).
2. Helper `isEnabled(key)` ; Nav (`nav-config`, Bottom-Nav, Command-Palette, FAB) filtert Einträge.
3. Disabled View → bestehendes `EmptyState` „Funktion noch nicht freigeschaltet“.
4. Neue View `devAdmin` (nur wenn Flag + Mock-Rolle `platform_admin`): Flag-Matrix, Health-Karten (Mock), User-Tabelle (Mock).
5. Keine Editionen/IAP in diesem Schritt.

### Done wenn
- `marketplace: false` entfernt Markt aus Sidebar/Mehr/⌘K und blockt die View.
- Dev-Admin-Screen erreichbar, nicht für normale User in der Nav (oder hinter Flag).
- Build grün.

---

## P1 — UI auf Service-Layer umziehen (1–2 Tage)

**Warum vor Next.js:** Danach ist die UI backend-agnostisch. Next.js-Umzug ändert nur Routing, nicht Datenfluss.

### P1.1 Hooks verdrahten (Reihenfolge)

Arbeite **eine Page nach der anderen**. Pattern steht in `ARCHITECTURE.md`.

| Reihenfolge | Page | Hook | Heute |
|---|---|---|---|
| 1 | `Social.tsx` | `useSocialPosts()` | IndexedDB **doppelt** (Page + `services/mock.ts`) — Page-IDB entfernen, nur Service |
| 2 | `Grows.tsx` | `useGrows()` | direkter `grows`-Import |
| 3 | `Strains.tsx` | `useStrains()` | `myStrainCollection` |
| 4 | `Auth.tsx` | `useAuth().login/register` | nur Toast + `navigate("dashboard")` |
| 5 | `Dashboard.tsx` | `useGrows()` + später Aggregat-Hook | mehrere Mock-Imports |

Pro Page:
```tsx
const { grows, loading, error, refresh } = useGrows();
if (loading) return <PageSkeleton />; // existiert in App.tsx
if (error) return <EmptyState title="Fehler" desc={error} />;
```

### P1.2 Service-Interfaces erweitern

`src/services/interfaces.ts` — für jede Domäne Interface + mock.ts + api.ts + Hook:

```
AuthService          me, login, register, logout, telegramLink
UserService          get, update, follow, unfollow
GrowService          + update, delete, addPhoto, updateEnv
LogService           listByGrow, create, update, delete
StrainService        + get, search, collection add/remove
BreederService       list, get, listStrains
ProductService       list, get, search (marketplace)
OfferService         listSeedOffers (ticker)
WikiService          list, get, update (version)
ForumService         listThreads, getThread, vote, comment
ChatService          listConversations, listMessages, send
NotificationService  list, markRead, markAll
SocialService        + follow suggestions, bookmark, report
RecipeService        list, get, fork, diff (Mixture-of-Erd's)
HallService          listFeatured
CalcService          saveScenario, listScenarios
AiService            chat, listAgents
```

REST-Pfade analog `ARCHITECTURE.md` (`GET/POST /grows`, `POST /grows/:id/logs`, …). Neue analog ergänzen.

### P1.3 Loading/Error überall
Nutze vorhandene `Skeleton`, `SkeletonCard`, `EmptyState`, `PageSkeleton`. Keine Blank-Screens.

### Done wenn
- Kein `from "@/mocks/data"` mehr in `src/pages/*` (Ausnahme: Showcase-Demos).
- `Social.tsx` hat keine eigenen `dbGet/dbSet`-Calls.
- `Auth.tsx` ruft `login()` / `register()` auf.
- Mock-Modus unverändert nutzbar ohne Backend.
- Build + Tests grün.

---

## P2 — pnpm-Monorepo + Next.js App (2–3 Tage)

Folge `MIGRATION.md`. Kurzfassung:

### Tasks
1. Root auf **pnpm** umstellen. `pnpm-workspace.yaml` existiert (`apps/*`, `packages/*`).
2. Packages anlegen:
   - `packages/ui` ← `src/components/**`
   - `packages/shared` ← `src/{lib,services,data,types,mocks}`
   - `apps/web` ← Next.js, verschiebe `app/`, `next.config.js` hierher
3. `apps/web/package.json`:
   ```json
   {
     "name": "@grow-observer/web",
     "scripts": { "dev": "next dev", "build": "next build", "start": "next start" },
     "dependencies": {
       "next": "^15", "react": "^19", "react-dom": "^19",
       "@grow-observer/ui": "workspace:*",
       "@grow-observer/shared": "workspace:*"
     }
   }
   ```
4. `transpilePackages: ["@grow-observer/ui", "@grow-observer/shared"]` in next.config.
5. Tailwind v4: `postcss.config.mjs` **nur in apps/web** mit `@tailwindcss/postcss`. `globals.css` = Inhalt von `src/index.css`.
6. `app/page.tsx` darf vorerst weiter `dynamic(() => import("@grow-observer/web-spa"), { ssr: false })` sein — oder die bestehende App als Client-Island.
7. Env: `NEXT_PUBLIC_API_URL` **und** in `packages/shared` Config so abstrahieren, dass Vite `import.meta.env.VITE_API_URL` und Next `process.env.NEXT_PUBLIC_API_URL` beide gehen:
   ```ts
   const api = process.env.NEXT_PUBLIC_API_URL ?? import.meta.env?.VITE_API_URL ?? "";
   ```
8. Images: `images.remotePatterns` für `images.pexels.com`. Langfristig `next/image`.
9. PWA: SW-Register als Client-Component (Snippet in `MIGRATION.md`).

### Done wenn
- `pnpm --filter @grow-observer/web dev` startet die App.
- UI identisch zum Vite-Stand.
- Vite darf als Legacy bleiben, muss aber nicht mehr der Pfad für Features sein.
- CI baut `apps/web` (`next build`).

---

## P3 — File-based Routing (2 Tage)

Ersetze `useNav()` vollständig.

### Mapping (verbindlich)

| ViewKey | Route |
|---|---|
| dashboard | `/(app)/dashboard` oder `/(app)/page` |
| grows | `/(app)/grows` |
| grows+growId | `/(app)/grows/[id]` |
| strains | `/(app)/strains` |
| breeders | `/(app)/breeders` + `[id]` |
| marketplace | `/(app)/marketplace` |
| wiki | `/(app)/wiki` + `[id]` |
| forum | `/(app)/forum` + `[id]` |
| social | `/(app)/social` |
| hallOfFame | `/(app)/hall-of-fame` |
| chat | `/(app)/chat` |
| ai | `/(app)/ai` |
| planner / calculator / consumption / simulation / report | `/(app)/tools/*` |
| notifications | `/(app)/notifications` |
| profile | `/(app)/settings` |
| telegram | `/(app)/settings/telegram` |
| showcase | `/(app)/dev/showcase` (dev-only oder hinter flag) |
| auth | `/(marketing)/login` |

### Layouts
- `app/(marketing)/layout.tsx` — kein AppShell (Login, Onboarding).
- `app/(app)/layout.tsx` — `<AppShell>{children}</AppShell>`.
- Middleware: unauth → `/login` für `(app)/*`.

### Code-Änderung
```ts
// vorher
navigate("grows", { growId: id })
// nachher
router.push(`/grows/${id}`)
<Link href={`/grows/${id}`}>…
```

Entferne `NavProvider` wenn keine Aufrufe mehr existieren. Command-Palette und Bottom-Nav auf `Link`/`router.push`.

### Done wenn
- URLs sind deep-linkbar und browser-back funktioniert.
- Kein `ViewKey`-Switch in `App.tsx` mehr.
- 404 über `app/not-found.tsx`.

---

## P4 — Backend-Fundament  [✅ umgesetzt — `apps/api`]

**Umgesetzt als eigenständiges Hono-Paket** (`apps/api`) statt Next-Route-Handler, da das Frontend
noch Vite ist und Self-Hosting (Docker) priorisiert war. REST-Vertrag = `src/services/api.ts`.
Details + Setup: **`apps/api/README.md`**. Start: `cd apps/api && docker compose up --build`.

Erledigt: Drizzle-Schema (alle Kern-Tabellen + Relations), Auth (Argon2+JWT), Grows-CRUD mit
Ownership, Forum, Social, Chat, Notifications, Katalog-Routen, Presigned S3-Uploads,
`docker-compose.yml` (Postgres+MinIO+API), `seed.ts` (Bucket+Admin+Katalog+Demo), validierte Env.

Offen für P4: Realtime (SSE/WS), Presence, Follows-Tabelle, Auth-Schutz auf `/upload/presign`,
Production-Build-Flow (build+start statt dev), Tests/E2E für die API.

### Ursprüngliches Stack-Setup (Referenz)
```
apps/api/            # umgesetzt (Hono + Drizzle + Postgres + MinIO)
  src/db/schema.ts, client.ts, migrate.ts
  src/routes/*, src/middleware/auth.ts, src/lib/*
  Dockerfile, docker-compose.yml, seed.ts
```

### Schema (erste Migration) — Tabellen

```
users              id, email, password_hash, name, handle, avatar_url, locale, currency, created_at
sessions           Auth.js
accounts           Auth.js (telegram later)
follows            follower_id, followee_id, unique(follower, followee)
grows              id, user_id, name, strain_id, medium, start_date, phase, health, cover_url, …
grow_logs          id, grow_id, day, title, body, tag, created_at
grow_photos        id, grow_id, url, taken_at
grow_env           id, grow_id, day, temp, rh, vpd, ec
strains            id, name, breeder_id, type, thc, cbd, flowering, …
breeders           id, name, location, …
user_strain_collection  user_id, strain_id
posts              id, user_id, text, image_url, created_at
post_likes         user_id, post_id
post_bookmarks     user_id, post_id
notifications      id, user_id, type, title, body, read, created_at
```

Weitere Tabellen in P6–P9.

### Auth
- Credentials: email+password, hash **argon2** oder bcrypt.
- JWT oder DB-session (Auth.js). Token-Format muss zu `src/lib/api.ts` (`Authorization: Bearer`) passen **oder** `api.ts` auf Cookie-Session umstellen (bevorzugt bei Same-Origin Next).
- **Same-Origin:** Wenn API = Route Handlers, Cookies + `credentials: "include"` sind besser als Bearer im localStorage. Dann `src/lib/api.ts` anpassen (einmalig, bewusst).

### Storage
- Presigned upload: `POST /api/uploads` → `{ url, key }`.
- Client PUT zu R2. Speichere nur `key` in DB.

### Sicherheit (Minimum)
- Rate-limit Auth-Routen.
- Zod-Validation jeder Input.
- Keine Secrets im Client (`ANTHROPIC_API_KEY` nur server).
- CORS nur nötig bei Variante C.

### Done wenn
- `GET /api/health` → `{ ok: true, db: true }`.
- Register + Login + `/api/auth/me` (oder Auth.js session) funktioniert gegen echte DB.
- Eine Test-User-Seed-Datei existiert (`drizzle-seed` oder SQL).
- Preview-Deploy auf Vercel mit Neon.

---

## P5 — Core-Funktionen Grow (3–5 Tage)

Das Herzprodukt. Ohne das ist alles andere Deko.

### 5.1 User-Profil
- GET/PATCH `/api/users/me` (name, handle, avatar, locale, currency, notification prefs).
- Avatar-Upload über Storage.
- Settings-Page verdrahten (`Profile.tsx`).

### 5.2 Strains & Breeders (Read-heavy)
- Seed-Script: Inhalte aus `src/mocks/data.ts` (`strains`, `breeders`) in DB.
- GET `/api/strains`, `/api/strains/:id`, `/api/breeders`, `/api/breeders/:id`.
- Collection: POST/DELETE `/api/me/strains/:id`.
- UI: `Strains.tsx`, `Breeders.tsx` über Hooks.

### 5.3 Grows CRUD
- POST `/api/grows` ← `CreateGrowInput`.
- GET list (nur eigene) + GET by id (own or public if later shared).
- PATCH phase/health/medium; DELETE.
- Logs: POST `/api/grows/:id/logs`.
- Photos: upload + attach.
- Env-Punkte: POST batch oder einzelnd (für Charts).

### 5.4 Dashboard
- Aggregat-Endpoint `GET /api/me/dashboard`:
  `{ activeGrows, openTasks, monthCost, avgHealth, climate?, nextTasks[] }`
- Bis Cost echt ist: Cost aus letztem Calc-Scenario oder 0.

### Done wenn
- User kann registrieren, Grow anlegen, Logs schreiben, Fotos sehen, Dashboard zeigt **seine** Daten.
- Fremde User sehen fremde Grows nicht (außer explizit public — default private).

---

## P6 — Social Feed (2–3 Tage)

### API
- `GET /api/feed` — posts from self + follows, cursor-pagination.
- `POST /api/posts` `{ text, imageKey, tags[] }`
- `POST /api/posts/:id/like` toggle
- `POST /api/posts/:id/bookmark` toggle
- `POST /api/posts/:id/report`
- `POST /api/users/:id/follow` toggle
- `GET /api/users/suggested`
- `GET /api/tags/trending`

### Realtime (optional in P6)
Nicht blockierend. Polling 30s reicht für MVP. Realtime = P10.

### Stories
MVP: weglassen oder nur „has new post today“-Ring. Keine ephemeren Stories im ersten Launch.

### Done wenn
- Compose speichert in DB, Feed lädt nach Reload, Likes persistieren, Follow ändert Feed.
- Mobile-Layout bleibt: rechte Rail `hidden lg:block` (nicht regressieren).

---

## P7 — Forum, Chat, Wiki, Notifications (4–6 Tage)

### Forum
Tabellen: `forum_subs`, `threads` (title, body, sub, author, votes), `thread_votes`, `comments` (parent_id für Nesting).
API analog. Rate-limit Posts. Soft-delete.

### Chat
MVP: 1:1 + eine „Crew“-Gruppe.
- Tabellen `conversations`, `conversation_members`, `messages`.
- REST: list / send. Realtime: **Supabase Realtime** oder **Pusher** oder SSE `GET /api/chat/:id/stream`.
- Nicht Socket.io in Vercel Serverless — wenn WebSockets: separater Worker (Fly) = später.

### Wiki
- `wiki_articles` + `wiki_versions` (author, body, version).
- GET list/search, GET by id, POST fork/edit → neue Version.
- UI-Edit-Button verdrahten (heute nur Toast).

### Notifications
- Schreiben bei: like, comment, follow, grow-task due, AI-alert.
- `GET /api/notifications`, `POST /api/notifications/:id/read`, `POST …/read-all`.
- Push: Web Push (VAPID) in P10. Bis dahin In-App + optional Telegram (P8/P9).

### Done wenn
- Thread erstellen/kommentieren/voten persistiert.
- Chat sendet und lädt Verlauf (auch ohne Live-Push).
- Wiki-Artikel lesbar, Edit erzeugt Version.
- Notification-Center zeigt echte Events.

---

## P8 — Tools, Marktplatz, Telegram, Report (3–4 Tage)

### Kostenrechner / Consumption / Simulation
- `calc_scenarios` (user_id, json payload, created_at).
- Save-Button in `Calculator.tsx` → POST. Liste in UI optional.
- Consumption: aus grows+env+user electricity price aggregieren **oder** manuell erfassen. Nicht fake-random in Prod.

### Marktplatz
Zwei Stufen:
1. **Read-only Katalog** (seeded products + seedOffers) — schnell.
2. **User listings** (`listings`: seller, product, price, condition) — erst nach Auth+Profil.

Filter (Zustand, maxPrice) bleiben clientseitig bis Katalog > 200 Items, dann Query-Params an API.

### Report PDF
Heute `window.print()`. Upgrade:
- Server: `GET /api/grows/:id/report.pdf` mit `@react-pdf/renderer` oder Playwright.
- Auth-gated. Nicht jsPDF im Client-Bundle (Single-File-/Edge-Bloat).

### Telegram
- Bot-Token **nur server**.
- Deep-Link: `https://t.me/Bot?start=<signed_token>` → `/api/telegram/webhook` verknüpft `users.telegram_id`.
- Notifications-Optionen aus Settings steuern, Worker sendet via Bot API.

### Done wenn
- Calculator-Szenario überlebt Reload.
- Marktplatz listet DB-Produkte.
- Report-PDF lädt als File (oder Print bleibt dokumentiert als Fallback).
- Telegram-Link setzt `telegram_id` (manuell testbar mit Test-Bot).

---

## P9 — AI Grow-Assistent (3–5 Tage)

### Architektur
```
Client → POST /api/ai/chat { agentId, messages[], growId? }
       → Server lädt User-Grow-Kontext (kein Trust auf Client-Context)
       → Provider (Anthropic/OpenAI) mit System-Prompt pro Agent
       → SSE stream zurück
```

- Keys nur server.
- Token-Budget / Rate-limit pro User.
- Persist `ai_messages` (user_id, agent, role, content).
- Agents aus DB oder Config: Grow Mentor, Mixture-of-Erd's, Klima-Wächter, Kosten-Optimierer (UI existiert).

### Mixture-of-Erd's
- `soil_recipes` (name, author_id, parent_id, components jsonb, ec, ph).
- Fork = insert mit parent_id. Diff bleibt Client-Funktion `diffRecipes()` gegen geladene Parent-Row.
- Optional: Pull-Request-Tabelle später. Nicht im MVP.

### Streaming UI
`AIAssistant.tsx` hat schon Typing-Mock. Ersetze Timeout durch SSE-Reader. `aria-live="polite"` behalten.

### Done wenn
- Echte Antwort mit Grow-Kontext.
- History nach Reload da.
- Recipe fork speichert in DB, Diff zeigt added/changed/removed.

---

## P10 — Harden & Launch (laufend, min. 3 Tage vor Launch)

### Tests
- Vitest: Services (mock) + `diffRecipes` + format (existiert).
- Playwright: login, create grow, create post (happy path).
- `tsc --noEmit` in CI für alle Workspaces.

### Observability
- Sentry (web + server).
- Request-ID + structured logs auf API-Routen.

### PWA
- SW an Next-Build anpassen (kein Vite-index.html-Fallback).
- Offline: App-Shell + letzte Grows aus IndexedDB (Service mock-Pfad wiederverwenden).
- Install-Prompt (Onboarding Step 2) an `beforeinstallprompt` koppeln.

### Legal / Content
- AGB, Datenschutz, Impressum-Routen.
- Grow-Content: Jurisdiktion prüfen (nur UI-Thema, kein Legal-Advice im Code).

### Performance
- `next/image` für Uploads + Pexels.
- Fonts selbst hosten oder weiter Google css2 (Subsets sind schon reduziert).
- Bundle-Report: `vite.analyze.config.ts` bzw. `@next/bundle-analyzer`.

### Done wenn
- Staging-Deploy mit Prod-ähnlicher DB.
- Checkliste Launch: Auth, Grow CRUD, Feed, 1 AI-Call, PWA installierbar, Error-Tracking live.

---

## 3. Reihenfolge der Page-Verdrahtung (wenn unsicher)

Immer diese Reihenfolge, auch innerhalb einer Phase:

1. Auth  
2. Grows + Logs + Dashboard  
3. Strains/Breeders (Read)  
4. Social  
5. Notifications  
6. Forum  
7. Wiki  
8. Chat  
9. Marketplace  
10. Calculator/Report  
11. AI  
12. Telegram / Hall of Fame (Hall kann lange Read-only + Moderation bleiben)

---

## 4. Explizite Nicht-Tun-Liste

- Kein Recharts, kein jsPDF im Client, solange Bundle-Disziplin gilt.
- Kein `postcss.config.mjs` im Repo-Root neben Vite.
- Kein `overflow-x: hidden` auf `body`.
- Keine Custom Properties ohne Einheit (`"272px"`).
- Keine Secrets im Client / in `NEXT_PUBLIC_*`.
- Kein Socket.io auf Vercel Serverless.
- Pages nicht weiter mit neuen direkten Mock-Imports aufblasen — immer Service/Hook.
- `package.json` der Vite-App nicht mit Next-Deps überladen; Next gehört nach `apps/web`.

---

## 5. Agent-Arbeitsprotokoll

Am Start jedes Sessions:

```
1. HANDOFF.md lesen
2. PLAN.md: welche Phase ist die niedrigste unerledigte?
3. Nur diese Phase anfassen
4. Build/Tests
5. CHANGELOG + PROGRESS
6. Falls Architektur-Änderung: ARCHITECTURE.md / MIGRATION.md nachziehen
```

Am Ende einer Phase: Abschnitt „Status“ hier updaten:

```
## Status
Aktuelle Phase: P0
Letzter Agent:
Datum:
Blocker:
```

## Status

```
Aktuelle Phase: P4 (Backend-Fundament) umgesetzt — apps/api (Hono+Drizzle+Postgres+MinIO).
Nächste Schritte: Backend via Docker starten, Frontend auf VITE_API_URL umschalten,
  dann P5 (Communities/Realtime) ausbauen.
Letzter Agent: claude-grow-dev
Datum: 2026
Blocker: keines (API-Typcheck läuft außerhalb des Vite-Builds — bei Erststart mit pnpm/npm in apps/api)
Fokus: PWA + Self-Host-Backend; Editionen/Native zurückgestellt (MILESTONES.md)
```

---

> Plan erstellt von `claude-grow-dev` (Claude · Anthropic) · 2026

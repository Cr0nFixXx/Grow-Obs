# ARCHITECTURE.md

How Grow|Observer is built: layers, modes, auth, realtime, moderation, routing, versioning, data.
Current state: [`HANDOFF.md`](./HANDOFF.md) · Endpoint contract: [`apps/api/README.md`](./apps/api/README.md) · Rules: [`CLAUDE.md`](./CLAUDE.md).

---

## 1. Layers

The UI never calls `fetch` or touches mock arrays directly. It talks to a **service layer** with two implementations (mock and API) that are swapped by
configuration, so the UI stays stable when the backend changes.

```
 UI (src/views)
   │  hooks: useGrows(), useSocialPosts(), useStrains() …
   ▼
 data layer (src/data)            useResource: last request wins, loading/error/refresh
   ▼
 service layer (src/services)     contracts in interfaces.ts
   ├─► mock.ts   static demo data (+ IndexedDB, artificial latency)
   └─► api.ts    HTTP client → apps/api
            ▲
 config.useMock (src/lib/config.ts) selects ← NEXT_PUBLIC_API_URL
```

Key files of the layer:

| File | Role |
|---|---|
| `src/types/domain.ts` (`@/types`) | domain types (single source of truth) and input types |
| `src/lib/config.ts` | `apiBaseUrl`, `useMock`, `pathRouting` |
| `src/lib/api.ts` | HTTP client (`http.get/post/put/patch/delete`), `ApiError`, `credentials: "include"`, event `go:session-expired` on 401 |
| `src/lib/auth.tsx` | `AuthProvider`, `useAuth()`, `useCurrentUser()`; knows only a session marker, never a token |
| `src/services/{interfaces,mock,api,index}.ts` | contracts, both implementations, factory |
| `src/data/{hooks,useResource,DataContext}` | data hooks for every productive domain |

**Provider hierarchy** (`src/App.tsx`): `ThemeProvider > I18nProvider > AuthProvider > DataProvider > FeatureProvider > ToastProvider > UpdateProvider > NavProvider > Shell`;
the `RealtimeProvider` sits inside `Shell` (signed-in users only). Page transitions: `AnimatePresence mode="wait"` keyed by `view`.
Theming: `<html data-theme="dark|light">` with semantic tokens (`DESIGN.md`), no FOUC thanks to an inline script in `app/layout.tsx`.

**Long term** two storage paths (`docs/MILESTONES.md`): Free edition = this stack (central API + PostgreSQL); Pro/CSC/Enterprise = local storage with an event log and E2EE,
optionally a relay that only sees ciphertext. The service interfaces stay the same (`mock` | `api` | later `local`).

---

## 2. Modes and configuration

| Mode | `NEXT_PUBLIC_API_URL` | Backend | Storage |
|---|---|---|---|
| **Embedded (default)** | unset → `/api` | Hono app inside Next.js (`app/api/[...route]` → `src/server/embedded-api.ts`) | PostgreSQL (`DATABASE_URL`) |
| External | `https://api.example.com` | `apps/api` as its own service (Docker) | PostgreSQL + MinIO |
| Demo/mock | empty | none | browser only, not persistent |

- `NEXT_PUBLIC_API_URL` is baked in at **build time** (Vite legacy: `VITE_API_URL`); `next.config.ts` defaults it to `/api`.
- **Embedded API:** same origin, no CORS, no second process. Migrations run on the first request. `API_EMBEDDED=true` (set by the adapter) makes S3 optional
  (presign answers `503`) and relaxes the CORS HTTPS rule. `/api/health` is a separate, database-free route (platform health check).
- **Secrets:** `DATABASE_URL` in `.env`, `JWT_SECRET`/`JWT_TTL` in `.env.local` (gitignored). Without `JWT_SECRET` the dev server generates a process secret
  (sessions end on restart); in production the API aborts with 503 unless `ALLOW_EPHEMERAL_JWT_SECRET=true`.
- The root `package.json` repeats the API runtime packages (hono, drizzle-orm, postgres, zod, jose, argon2, aws-sdk) in the same versions as `apps/api` – **bump both** on updates.
- Relative imports in `apps/api` end in `.ts`; the build rewrites them to `.js` (`rewriteRelativeImportExtensions`) because Turbopack does not resolve `.js` to `.ts`.
- **Server:** production and preview run through `scripts/server.mjs` (Next + WebSocket forwarding). With plain `next dev`/`next start` or on serverless hosting there is no WebSocket
  and the client falls back to SSE.
- **Legacy Vite build** (`npm run build:vite`): single-file build (`vite-plugin-singlefile`), JS and CSS are inlined into `dist/index.html`. Files from `public/` are emitted separately
  and are missing when only `index.html` is served – import mandatory visible assets (e.g. the hero) from `src/`. No typecheck, no API, no paths.

---

## 3. Authentication and sessions

```
browser ── cookie go_session (HttpOnly) ──► requireAuth ─► JWT (sub, sid) ─► row in `sessions` ─► role from `users`
```

- **Transport:** HttpOnly cookie `go_session` (SameSite=Lax, Secure on HTTPS). No bearer token, no token in storage or body; the browser only knows the marker
  `go-session:api:<url>=1` (`src/lib/session-storage.ts`). **Mock mode** is separate.
- **Checked on every request** (`apps/api/src/lib/session.ts`, `middleware/auth.ts`): cookie → JWT with `sid` → row in `sessions` → role from the database. The JWT role is never
  the authorization source. `csrfGuard` (`middleware/csrf.ts`) protects all unsafe methods and runs globally before the routes.
- **Lifetime:** `JWT_TTL` (default 30 days) is the absolute session lifetime. Without "stay signed in" at most 12 hours and a session cookie.
  `last_seen_at` is written at most every 5 minutes; expired rows are deleted on the next login.
- **Devices:** at most 5 sessions per account (the oldest inactive one ends); device list, end a single session, "sign out on all devices" (`SessionsCard`).
  A 401 from a regular request fires `go:session-expired` and a local sign-out.
- **Password change** (`POST /auth/password`): current password required (wrong = **403**, never 401), ends all other sessions, keeps the current one.
  **Login history** (`login_events`): time, device, result, **no IP**, retained for 90 days.
- **Forced password change** (`users.must_change_password`): set for one-time passwords (operator creation, `--reset-password`). Until it is changed every endpoint except
  `GET /auth/me`, `POST /auth/password` and `POST /auth/logout-all` answers `403 password_change_required`; the shell shows only `ForcedPasswordChange` beforehand.
- **Operator bootstrap:** CLI only (`npm run admin:create`, `lib/operator.ts`): random password (24 characters, printed once, no `--password`), `--promote` for existing accounts
  (ends their sessions), `role_changed` event in the log. No automatic demo admin.
- **Rate limits** (`middleware/rate-limit.ts`, table `rate_limits`, shared by all instances, hashed keys, in-memory fallback if the DB fails):
  login 10/15 min per IP and per email, registration 10/h per IP, upload presign 30/10 min per user, password change 5/15 min per user; answer `429` + `Retry-After`.
  `TRUST_PROXY=false` ignores `X-Forwarded-For`, `RATE_LIMIT_DISABLED=true` switches limits off (E2E only).
- **Cross-origin operation** (external API) only works if frontend and API are *same-site* (e.g. `app.` and `api.` of one domain) and the frontend origin is listed in `CORS_ORIGINS`.
- **Sandbox preview only:** the preview proxy forwards neither `Cookie` nor `Authorization`. `ALLOW_HEADER_SESSION=true` additionally returns the token in the body and accepts
  `X-Session-Token`; `COOKIE_SAMESITE=none` produces `Secure; SameSite=None; Partitioned` for the iframe. `scripts/preview.sh` sets both – **never in production**.

---

## 4. Realtime

```
browser ── WebSocket /api/realtime/ws ──┐                      ┌── instance A (hub) ── local connections
        └─ fallback SSE /api/realtime/stream ─► API instance ─┤
                                                  │  NOTIFY   └── instance B (hub) ── local connections
                                          PostgreSQL LISTEN/NOTIFY (channel go_realtime)
```

- Transport chain WebSocket → SSE → polling (8 s). Events travel over PostgreSQL `LISTEN/NOTIFY` – several API instances need no Redis, a load balancer needs no stickiness.
- `apps/api/src/realtime/`: `hub.ts` (connections, delivery to users/topics, presence, heartbeat), `commands.ts` (client → server), `ws.ts` (upgrade), `index.ts` (hook for `scripts/server.mjs`).
  Sources: `routes/{chat,forum,realtime}.ts`, `lib/notify.ts` (`createNotification` = store + push live).
- Events: `chat.message|chat.read|chat.typing|presence|notification|thread.comment|resync`. **They carry IDs only** (payload < 7.5 KB); data comes through the authorized REST API.
- Limits: 5 connections per account (the oldest closes with 4008); sessions are re-checked every 25 s, so logout / "all devices" / password change close live connections (code 4401).
- WebSocket auth: cookie, or (only with `ALLOW_HEADER_SESSION`) a first message `{type:"auth",token}` within 5 s; the Origin must match the host or `CORS_ORIGINS`.
- Frontend: `src/lib/realtime.ts` (React-free: transport choice, backoff, visibility), `realtime-context.tsx` (`RealtimeProvider`, `useRealtimeEvent`, `useRealtimeTopic`),
  translation into data refreshes via `useRealtimeBridge` and `src/data/hooks.ts`. Mock mode opens no connection.
- Next route handlers cannot accept WebSocket upgrades, hence `scripts/server.mjs`; it sets `app.didWebSocketSetup = true` (Next internals) because Next otherwise attaches its own `upgrade`
  listener that closes foreign sockets. The hub registers itself on the first API call in `globalThis.__growRealtimeUpgrade`.
- Reverse proxy: forward `Upgrade`/`Connection` for `/realtime/ws`, disable buffering for `/realtime/stream`, read timeout ≥ 60 s (nginx example: `apps/api/README.md`).

---

## 5. Community moderation

| Role (per community) | read/write feed | report | hide/unhide | remove/ban member | assign roles | ban list |
|---|---|---|---|---|---|---|
| non-member / banned | ✗ (404/403) | ✗ | ✗ | ✗ | ✗ | ✗ |
| member | ✓ | ✓ (others' content) | ✗ | ✗ | ✗ | ✗ |
| moderator | ✓ | ✓ | ✓ (not admins' content) | members only | ✗ | ✗ |
| admin | ✓ | ✓ | ✓ | members and moderators (never admins) | ✓ | ✓ |

- Posts with a `community_id` are visible to members only and are absent from the global feed and the operator content list. Reads go through `lib/moderation.ts`
  (`communityRole`, `isModerator`, `loadPostForViewer`).
- Hiding sets `hidden_at` (reversible); hidden content is visible to the moderation only. Reports (`reports`) exist once per person and item and are decided grouped by item
  (`hide` or `dismiss`). Affected users get a notification of type `system`.
- Kick with optional ban (`community_bans`): banned users cannot join, not even with an invite code; only admins see and lift bans.
- UI: `src/views/Communities.tsx` (tabs Feed/Mitglieder/Moderation), `src/components/community/*`, `CommentsSheet`.

---

## 6. Routing and 404

- Own lightweight router (`src/lib/nav.tsx`, `useNav()`) coupled to the browser history; paths ↔ views live in `src/lib/routes.ts` (`SEGMENT`, `DETAIL_PARAM`, `shareUrl`).
  Paths instead of query/hash; detail IDs (`/grows/<id>`, `/strains/<id>`) and profile tabs are part of the address; an old `?view=` link becomes a path; a deep link after login leads to its target.
- The Next shell `app/[[...slug]]/page.tsx` (server) checks the path with `parsePath` and otherwise calls `notFound()` → HTTP 404 with `app/not-found.tsx`; `client.tsx` is the SPA.
  `/auth`, `/create`, `/dev-admin` and anything unknown (also too deep or unsafe paths) answer 404. Inside the app the `notFound` view keeps the wrong address.
- `public/sw-policy.js` (`appSegments`) serves the shell only for known app routes; a test keeps both lists in sync. `scripts/server.mjs` answers malformed
  percent-encoding (`/%E0%A4%A`) with 400.
- Not implemented: SSR/file-based routing per view; detail URLs for wiki, showcase and marketplace.

---

## 7. Versioning, updates, feature flags

- **Versions** live only in `version.json` (`frontend {codename, version}`, `backend {version}`, `build`, `modules`); `scripts/version.mjs` (`version:sync|check|build|show`) aligns
  `package.json`, lockfiles and `apps/api/src/version.generated.ts` (the Docker image only sees `apps/api/`). There is deliberately no command to bump versions.
  Modules: `"frontend.<module>"` / `"backend.<module>"` under `modules`; without an entry they inherit the component version (`moduleVersion()`).
  The old `v0.x` numbering in `docs/CHANGELOG.md` and `docs/archive/` predates the version reset and stays unchanged.
- **Display:** login footer, Settings → Updates, Dev-Admin → Updates, `GET /api/version` (frontend + backend), standalone API `GET /version`.
- The **build number** `YYMMDDHH` (Europe/Berlin) is display-only. **Update detection** uses the random build ID (`next.config.ts` → `generateBuildId`, `/api/version` reads `.next/BUILD_ID`):
  the client compares on start, on visibility/online, every 5 minutes and on pull-to-refresh.
- **Update flow:** per-device user setting (automatic, ask, manual), "what's new"; operators publish release notes in Dev-Admin (urgency optional/recommended/mandatory,
  optionally enabling features at the same time; `GET /releases`, `POST/DELETE /admin/releases`). *Mandatory* blocks outdated builds. Logic: `src/lib/update-logic.ts`, state: `update.tsx`, UI: `UpdateUI.tsx`.
- **Feature flags** are global (table `feature_flags`, `GET /features`, `PUT /admin/features/:key`). The API blocks routes of disabled features with `403 { feature }`
  (path mapping `apps/api/src/lib/features.ts`); core features cannot be disabled (409). The `FeatureProvider` loads overrides on start, on focus, every 60 s, on pull-to-refresh and after a 403.
  A test checks key parity `src/config/features.ts` ↔ `apps/api/src/lib/feature-keys.ts`. In mock mode flags apply locally only.

---

## 8. Media, PWA cache, demo data

- **Media:** images are stored in PostgreSQL (`media`, migration 0002): `POST /media` (raw body, JPEG/PNG/WebP, format by magic bytes, at most 2 MB, quota 200 images/100 MB per user),
  `GET /media/:id` public via an unguessable UUID (`<img>` cannot send a bearer; CSP `default-src 'none'; sandbox`, `nosniff`), `DELETE` by the owner only. The stored value is the path
  `/media/<uuid>`; the UI resolves it with `resolveMedia()`. The client shrinks photos to at most 1600 px (which strips EXIF/GPS). S3/MinIO (`/upload/presign`) is optional and signs against
  `S3_PUBLIC_ENDPOINT`.
- **PWA cache:** `public/sw-policy.js` defines a static allowlist of public shell assets (incl. hashed `/_next/static/*`); APIs, signed URLs, external images and private responses are never
  cached, old `go-*` caches are removed on upgrade. There are no offline writes and no account caches.
- **Demo-data rule:** `config.useMock` permits demo data from `src/mocks/data.ts`; otherwise real data or an honest empty state. Views without a data source in API mode: cost/consumption, AI chat,
  soil recipes, stories, strain ratings. Reference content (calculator, simulation, showcase) stays static. `Avatar` always gets `name` (initials fallback).

---

## 9. Data model and migrations

Migrations are handwritten SQL in `apps/api/drizzle/` with a committed journal and **no Drizzle snapshot** – never run `db:generate` blindly and never apply `0000_initial.sql` to an
existing database. Schema: `apps/api/src/db/schema.ts` (every `many()` relation needs its inverse).

| No. | Content |
|---|---|
| 0000 | initial schema (users, catalog, grows, social, forum, chat, communities, notifications) |
| 0001 | tasks (`tasks`), author columns for strains and wiki |
| 0002 | media (`media`), strain collection (`strain_collection`) |
| 0003 | comment votes, comments on hall-of-fame entries and posts (`item_comments`) |
| 0004 | global feature flags (`feature_flags`) |
| 0005 | release notes (`app_releases`) |
| 0006 | default forum areas (idempotent) |
| 0007 | sessions (`sessions`) |
| 0008 | login history (`login_events`, no IP) |
| 0009 | `users.must_change_password` |
| 0010 | chat/realtime: read position, direct-message key, presence |
| 0011 | shared rate-limit table (`rate_limits`, UNLOGGED) |
| 0012 | community feed, hiding, ban list (`community_bans`), reports (`reports`) |

---

## 10. Recipes

- **New domain:** type in `src/types/domain.ts` → interface in `services/interfaces.ts` (and add it to `Services`) → mock in `mock.ts` → API in `api.ts` → hook in `data/hooks.ts` → the view uses the hook, never mock data directly.
- **New API route:** create it in `apps/api/src/routes` and mount it in `app.ts` (the embedded API picks it up, no frontend proxy needed), use `requireAuth`, add the contract to `apps/api/README.md`.
- **New notification:** always `createNotification` (`lib/notify.ts`); type from `grow|task|forum|shop|ai|system`.
- **New screen:** `ViewKey` in `nav.tsx`, grouping in `src/components/layout/nav-config.ts`, view in `src/views/` (never `src/pages/`), `views` map in `App.tsx`; with a URL also a segment in `routes.ts` **and** `public/sw-policy.js`.
- **New feature flag:** key in `src/config/features.ts` and `apps/api/src/lib/feature-keys.ts`, path mapping in `apps/api/src/lib/features.ts`.
- **Quick action/form:** `src/config/create-kinds.ts` + form in `src/views/Create.tsx`.
- **Image upload:** `ImagePickButton` / `useImageUpload` (`src/components/media.tsx`).
- **Swipe gestures:** `src/lib/gestures.ts` (`useSwipeToDismiss`, `useTabSwipe`); opt out with `data-no-swipe` / `data-no-tab-swipe`.
- **npm:** the root `.npmrc` (`legacy-peer-deps=true`) is a deliberate workaround for an npm 10 crash on optional vitest peers; `npm run check:peers` (also in CI) checks the required peers.

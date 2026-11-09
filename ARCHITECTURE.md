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
  Sources: `routes/{chat,forum,realtime}.ts`, `lib/notify.ts` (`createNotification` = store + push live + web push).
- Events: `chat.message|chat.read|chat.typing|presence|notification|thread.comment|resync`. **They carry IDs only** (payload < 7.5 KB); data comes through the authorized REST API.
- Limits: 5 connections per account (the oldest closes with 4008); sessions are re-checked every 25 s, so logout / "all devices" / password change close live connections (code 4401).
- WebSocket auth: cookie, or (only with `ALLOW_HEADER_SESSION`) a first message `{type:"auth",token}` within 5 s; the Origin must match the host or `CORS_ORIGINS`.
- Frontend: `src/lib/realtime.ts` (React-free: transport choice, backoff, visibility), `realtime-context.tsx` (`RealtimeProvider`, `useRealtimeEvent`, `useRealtimeTopic`),
  translation into data refreshes via `useRealtimeBridge` and `src/data/hooks.ts`. Mock mode opens no connection.
- Next route handlers cannot accept WebSocket upgrades, hence `scripts/server.mjs`; it sets `app.didWebSocketSetup = true` (Next internals) because Next otherwise attaches its own `upgrade`
  listener that closes foreign sockets. The hub registers itself on the first API call in `globalThis.__growRealtimeUpgrade`.
- Polling-only mode (`NEXT_PUBLIC_REALTIME=polling`, build time): the client never opens a WebSocket or SSE stream; the status stays `polling` and the provider emits a `poll` event every 8 s while the tab is visible. `next.config.ts` makes this the default when the build runs on Vercel (`VERCEL` set); `NEXT_PUBLIC_REALTIME=auto` overrides it. Side effects: no presence (users appear offline), no typing indicator.
- Reverse proxy: forward `Upgrade`/`Connection` for `/realtime/ws`, disable buffering for `/realtime/stream`, read timeout ≥ 60 s (nginx example: `apps/api/README.md`).

### Group chats (B-65)

Conversations with `is_group` get roles, topics and invitations; direct messages are unchanged (`topic_id` null).

- Tables (`0014`): `conversations.history_visible`; `conversation_members.role|joined_at`; `conversation_topics` (name, emoji, `is_default`, `is_private`, `admins_only`, `closed`, `pinned`, `position`); `topic_members` (private topics); `topic_user_state` (`last_read_at`, `muted`); `conversation_invites` (`pending|accepted|declined|revoked|expired`, 7 days, partial unique index per group and invitee while pending); `messages.topic_id|kind` (`system` = notice line).
- Rules: joining only by accepted invitation; only admins invite, remove, rename and manage topics; anyone may leave (no admin left → oldest member is promoted; empty group is deleted). Members + open invitations ≤ 20, enforced under `SELECT … FOR UPDATE` on the conversation row. A private topic is visible to its members and all admins; closed or `admins_only` topics accept messages from admins only.
- History: group messages are returned only from `joined_at` on unless `history_visible`. Unread is **per topic** (own and system messages never count; reading = `topic_user_state.last_read_at`); the list and `/chat/unread` sum all accessible, non-muted topics.
- Realtime: `chat.message` carries `topicId` and goes to the topic audience (private topics: members + admins); `chat.group {conversationId}` tells all members (and invitees) to reload members, topics and invitations; `chat.typing` may carry `topicId`.
- Push: title = group name, body "Sender: text" (neutral text unless preview is on), tag per topic, muted members skipped, system lines never push. An invitation is a normal notification (category `messages`).
- Code: `apps/api/src/lib/chat-groups.ts` (limits, access, audience, system lines, unread), `routes/chat-groups.ts` (mounted under `/chat`), `routes/chat.ts`; frontend `src/lib/chat-groups.ts` (pure helpers), `useChat` (`group`, `activeTopic`, `groupActions`), `src/components/{NewGroup,GroupInfo,GroupTopics,GroupInvites,TopicBar,PeoplePicker}.tsx`. Groups need the server: the demo (mock) mode hides the buttons.

### Web push (B-63)

Notifications reach devices whose app is closed. In-app delivery stays the source of truth; push is an add-on whose failure never fails a request.

```
createNotification / POST /chat/:id/messages ─► lib/push.ts sendPushToUser(userId, {category,…})
   checks in order: VAPID configured → feature flag `push` → subscriptions exist → category enabled
                    → quiet hours (user's IANA timezone) → user online (live connection) → throttle (1 per tag / 15 s)
   ─► web-push (VAPID, encrypted payload) ─► browser push service ─► public/sw.js `push` ─► showNotification
```

- Tables (`0013`): `push_subscriptions` (one row per device, unique `endpoint`, bound to a `session` and cascading with it; removed on 404/410 or after 5 failures; max 5 per user) and `push_prefs` (categories `messages|community|grows|other`, `show_preview`, quiet hours, timezone).
- Payload is **neutral by default** ("Neue Nachricht", no names or text); with `show_preview` the real title/body (truncated). The URL is an in-app path (`/chat`, `/forum`, …); the service worker only accepts app paths and posts `GO_NAVIGATE` to an open window (else `openWindow`).
- Endpoints are restricted to the browsers' push hosts (`isAllowedEndpoint`, SSRF guard). Operators generate VAPID keys once (`npm run push:keys` in `apps/api`) and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`; all three or none.
- "Online" is user-level (`onlineAmong`): a user online on desktop gets no push on a closed phone PWA. iOS needs the installed PWA (16.4+).
- Code: `apps/api/src/lib/{push-core,push}.ts` (pure logic / delivery with injectable sender), `routes/push.ts`; frontend `public/sw-push.js` + `sw.js`, `src/lib/push.ts`, `src/components/{PushCard,PushBridge}.tsx`.

---

### Serverless deployment (Vercel + Supabase, test setups)

- Works as the embedded API (route handler `app/api/[...route]`, Node runtime). Verified in the local build trace: `apps/api/drizzle/*` and the native `argon2` binary are part of the function bundle.
- Env: `DATABASE_URL`, `JWT_SECRET` (≥ 32 characters), `NEXT_PUBLIC_SITE_URL` (full `https://…` URL, build time; without the scheme `new URL()` aborts the build). Optional: `S3_*` (uploads), `VAPID_*` (push). Never set the sandbox variables `ALLOW_HEADER_SESSION` / `COOKIE_SAMESITE`.
- **Connections:** every serverless instance opens its own pool (`DB_POOL_MAX`, default 10) and each one starts with a migration run. Many instances at once exhaust a small pooler (Supabase session pooler); the embedded API then answers 503 `Backend nicht verfügbar` (the instance retries on the next request). Frozen instances keep pooler sessions (B-77: `/auth/me` failed for every call until the sessions were terminated). Counter-measures: `DB_POOL_MAX=1` (the Supabase transaction pooler on 6543 was tried with `prepare: false` and made every query hang: do not use it without a separate test deploy) (Supabase session pooler, about 16 sessions), idle timeout 10 s, `max_lifetime` 5 min, `SKIP_MIGRATIONS=true` once migrated, polling-only realtime (a 300 s SSE stream keeps an instance and a `LISTEN` connection busy). B-79: on Vercel (`VERCEL` set) `src/server/embedded-api.ts` releases the connection (`resetDbConnection()` in `apps/api/src/db/client.ts`) as soon as the last in-flight request of the instance ends, because frozen instances never run `idle_timeout`; a 12 s request deadline discards a stuck connection and answers 503 `DB_TIMEOUT`. Self-host keeps its pool.
- Use the **session** pooler (port 5432) or the direct connection, not the transaction pooler (6543): `LISTEN/NOTIFY` and prepared statements need session semantics. Put the function region next to the database (Supabase `eu-west-1` → Vercel `dub1`).
- `embedded_api_boot_failed` log lines carry `causeCode`/`cause` (driver error, no credentials) next to `type`.
- Supabase exposes `public` tables through its Data API: disable it or enable row level security (the app connects as table owner `postgres` and is unaffected). New migration tables are not covered automatically.

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

### Weekly report (B-71)

- Opt-in per account (`users.weekly_report`, set through `PATCH /auth/me { weeklyReport }`). `GET /api/cron/weekly-report` (`apps/api/src/routes/cron.ts`) runs `runWeeklyReports` (`apps/api/src/lib/weekly-report.ts`): for every opted-in account whose `weekly_report_week` differs from the current ISO week (Europe/Berlin) it claims the week atomically (`UPDATE … RETURNING`), then creates one `grow` notification (+ web push in category `grows`, with the user's push preferences) listing each grow: day since `start_date`, phase, log entries of the last 7 days. Accounts without a grow get nothing.
- Protected by `CRON_SECRET` (Bearer, timing-safe compare); without the variable the route answers 404. `vercel.json` registers a Vercel Cron `0 17 * * 0` (Sundays 17:00 UTC = 18:00 CET / 19:00 CEST; Hobby cron precision is about one hour). Other hosts call the URL from an external cron.
- Device-only preferences (B-71, `localStorage`, `ThemeProvider`): `go-reduce-motion` (`on`/`off`; absent = follow `prefers-reduced-motion`; sets `html[data-reduce-motion]`, CSS and `MotionConfig`) and `go-sound` (`SoundBridge` plays a Web Audio tone when unread notifications or unread chat messages increase while the app is visible).

### Profiles and follows (B-73)

- Fields and limits live in `apps/api/src/lib/profile-fields.ts` (copied to `src/lib/profile-fields.ts`; a test keeps both equal). `PATCH /auth/me` is strict (unknown keys → 400); the handle changes at most once per 30 days.
- `GET /members/:handle` (`apps/api/src/routes/members.ts`) cuts the response server-side: a viewer who may not see the profile gets only name, avatar, title, `relation`, `canFollow` and `restricted: true`. "All" means logged-in members. Follow: immediate if the target is `all`, a pending request if `followers`, refused if `nobody`; accepting/declining via `/follows/requests/...`.
- Frontend: view `member` (`/u/<handle>`, `src/views/MemberProfile.tsx`), shared parts in `src/components/members.tsx`, `MemberService` (mock: session-only demo follows).

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

- **Media:** images are stored in PostgreSQL by default (`media`, migration 0002); with `MEDIA_STORAGE=s3` (B-76, needs the `S3_*` credentials) the bytes go to the private bucket (`media/<owner>/<id>`, migration 0017 adds `storage_key`), the row keeps only metadata and the quota, and `GET /media/:id` answers `302` to a signed link (1 h; browser may keep the redirect 30 min), `DELETE` removes row and object. Credentials alone never switch the backend. Lifecycle (B-78): replacing/removing a profile image deletes the old one when no column references it any more (`lib/media-cleanup.ts`, list `MEDIA_REFERENCES`, guarded by a schema test), and the daily cron `/cron/media-cleanup` removes unreferenced images older than 24 h. Upload API: `POST /media` (raw body, JPEG/PNG/WebP, format by magic bytes, at most 2 MB, quota 200 images/100 MB per user),
  `GET /media/:id` requires a login (B-82; the session cookie is sent by `<img>` too; 401 otherwise). Chat attachments are served only to members of the conversation and the owner (404 for everyone else). CSP `default-src 'none'; sandbox`, `nosniff`; `?raw=1` streams a PDF through the API for the in-app preview (`private, no-store`). With `MEDIA_STORAGE=s3` the response is a redirect to a signed link that is valid for 1 h and works like a bearer link. `DELETE` by the owner only. The stored value is the path
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
| 0013 | web push: `push_subscriptions` (per device, unique endpoint, cascades with session/user), `push_prefs` |
| 0014 | group chats: roles, join time, topics, invitations, message kind |
| 0015 | weekly report (B-71): `users.weekly_report` (opt-in, default off), `users.weekly_report_week` (ISO week of the last report, prevents double sends) |
| 0017 | media in object storage (B-76): `media.data` nullable, `media.storage_key`, check "bytes or key", `users.cover_url` |
| 0021 | grow diary (B-85): `grows.leaf_offset`, `grow_logs.logged_on`, `grow_photos.caption`, `grow_env.ph/logged_on` (readings nullable, one row per grow and day, unique index), backfill of existing rows |
| 0022 | grow target ranges (B-86): `grows.ph_min/ph_max/ec_min/ec_max` (defaults 5.8/6.5/1/2, `NULL` = no band) |
| 0020 | grow lifecycle (B-84): `grows.strain_name/status/condition/archived_at/ended_on/phase_dates/wet_weight_g/dry_weight_g`, backfill of existing grows |
| 0016 | profiles and follows (B-73): `users.bio/location/grow_since/medium/interests/profile_visibility/handle_changed_at`, table `follows` (pending/accepted, no self-follow, RLS on) |

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

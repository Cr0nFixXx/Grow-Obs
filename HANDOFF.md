# HANDOFF.md

**For:** coding agents and developers taking over **Grow|Obs** (cannabis-grow community PWA; UI language: German).
Read this file first, then `CLAUDE.md` (rules). **Measured test status:** `docs/TESTING.md`. **Open work:** `TODO.md`, roadmap `PLAN.md`.

**State: B-102 "New grow" as a 4-step wizard (`GrowWizard`, `src/lib/grow-wizard.ts`; name+strains → setup tiles → start date + visibility → review; `POST /grows` accepts `visibility`; local, not yet deployed; no migration) on top of B-101 diary entries, photos and pH/EC per strain (live in production since build 26111012, commit `37cc5af`, migrations 0030 and 0031 applied; `strain_ids` on logs/photos, table `grow_strain_env`, stable strain ids; migration 0031; strain filter in the grow detail; temp/RH stay grow-wide) on top of B-100 multiple strains per grow (up to 20 per grow with breeder, plant count and harvest weights per strain; `grows.strain_list` jsonb, migration 0030 — live) on top of B-98 (compact forum filter) and B-99 (status in a drawer), both live since build 26111004. Before that: B-97 live status (permanent text status + 24 h status with photo, per-status visibility all/followers/nobody on top of `canViewProfile`, reply opens the DM with a server-set status quote; live in production since build 26111002, commit `cc6d092`, migration 0029 applied) on top of B-96 scroll jump fix (`restoreScroll`, instant; local) on top of B-95 round 3d (what's-new window, texts in `src/data/whats-new.json`, local) on top of B-94 round 3c (chat: long-press select, reply with quote, multi delete/copy, avatar/name clicks; migration 0028 applied in production) on top of B-93 round 3b (forum search/filters, comment sort; local) on top of B-92 round 3a (grow visibility private/public/community with migration 0027, profile grows list + read-only grow view, profile image menu, forum/wiki activity on profiles; local, not yet deployed, migration 0027 NOT yet applied in production); B-91 round 2 is live (commit `97e5dc1`, name "Grow|Obs" everywhere, brand -> home, clickable home tiles/activity); B-90 round 1 is live (commit `b1f209f`, forum sort, report PNG, drawer scroll jump, toast swipe, profile spacing); B-89 (moderation round: operator bans/unbans/deletes accounts with a moderation log, global feed and forum report/hide, leave a community, paged report queue, live community feed; migration 0026; live (commit `bb56929`, migration 0026 applied in production) — B-74 is live (build 26110919, migration 0025); B-87 e-mail is live but inactive until SMTP is configured** · Frontend "Ruderalis" v0.1.2 · Backend v0.0.3 (see `version.json` for the build number). Branch `A` (pushed to `origin/A` only when the owner asks).
Next.js 16 is the primary build (client-side SPA shell, embedded Hono API under `/api`, PostgreSQL); Vite is a legacy single-file build.
Docker/MinIO and touch behavior on real devices have **never** been tested.

---

## 1. What exists

- **Frontend:** React 19, TypeScript, Tailwind v4, Framer Motion; 28 view files (dashboard, grows, strains, breeders, marketplace, wiki, forum, chat,
  social feed, communities, hall of fame, calculators, AI assistant UI, notifications, profile/settings, developer admin …); mobile shell with
  bottom sheets and gestures; PWA (manifest, service worker with a public-shell allowlist); feature flags; update flow ("what's new").
- **Backend (`apps/api`):** Hono + Drizzle + PostgreSQL, JWT + Argon2, cookie sessions, S3/MinIO presign (optional), realtime (WebSocket → SSE → polling over LISTEN/NOTIFY).
- **Product features:** auth with device list, password change and login history; grow diary; public/private communities with invites, roles, per-community feed,
  moderation (hide, report queue, kick/ban); social feed; forum with votes and replies; direct chat with typing/presence/unread; notifications; wiki; catalog;
  strain collection; media uploads (stored in PostgreSQL); operator CLI; URL routing with real 404.
- **Modes:** embedded API (default, `/api`), external API (`NEXT_PUBLIC_API_URL=https://…`), demo/mock (`NEXT_PUBLIC_API_URL=` empty). Demo data exists **only** in mock mode.

Quick start and commands: `README.md`. Checks: `docs/TESTING.md`. Agent sandbox: `node -v` must print 22 (a system Node 20 may shadow it – `export PATH=/usr/local/bin:$PATH`);
the preview needs PostgreSQL running; after code changes rebuild before restarting the preview (`PREVIEW_REBUILD=1 npm run preview`).

---

## 2. Repository map

```text
app/                      Next.js shell: layout.tsx, not-found.tsx, [[...slug]]/ (page.tsx = server 404 check, client.tsx = SPA),
                          api/[...route] (embedded API), api/health, api/version
src/
  App.tsx                 providers, view router, onboarding, forced-password gate
  views/                  one file per screen (never src/pages – reserved by Next)
  components/             ui.tsx (primitives), charts.tsx, Icon.tsx, media.tsx, layout/ (AppShell, nav-config), community/ (feed, moderation, report)
  services/               interfaces.ts, mock.ts, api.ts, index.ts (factory by config.useMock)
  data/                   hooks.ts (all productive data hooks), useResource.ts, DataContext.tsx
  lib/                    api.ts, auth.tsx, nav.tsx, routes.ts, realtime*.ts, update*.ts, config.ts, gestures.ts, asset.ts, session-storage.ts …
  config/                 features.ts (flags), create-kinds.ts
  server/                 embedded-api.ts, jwt-secret.ts
  mocks/data.ts, types/domain.ts, index.css (Tailwind v4 tokens)
apps/api/
  src/{app.ts,index.ts,env.ts,config/,db/,lib/,middleware/,realtime/,routes/,cli/}   drizzle/ (0000–0012 handwritten SQL + journal)
  seed.ts   Dockerfile   docker-compose.yml (db, minio, migrate, storage-init, api, admin, seed)
public/                   manifest, icons, sw.js, sw-policy.js (cache allowlist, executed by tests)
scripts/                  server.mjs (Next + WebSocket), preview.sh, version.mjs, check-peers.mjs, check-doc-links.mjs (npm run docs:check), test-api.sh, smoke-live.sh
promo/                    promo demo video (scene.html, build.sh, PROMODEMO.md); generated: music.wav, syslibs/, .frames/ (ignored)
promo-kit/                motion-graphics promo kit (BRIEF.md, engine/, scenes/, screenshots/, mockups/, stills/, brand/, tools/); sources only, frames live outside the repo
.claude/skills/           project skills doc-create, doc-maintain, version-bump (generic copies: docs/skills/)
tests/                    unit/ (Vitest, mirrors src/), api/ (integration), e2e/ (Playwright)        docs/  TESTING, CHANGELOG, PROGRESS, MILESTONES, archive/
version.json              single source for versions        .github/workflows/ci.yml  frontend, API, E2E jobs
```

---

## 3. Subsystem notes (where to look, what to watch)

| Subsystem | Key files | Watch out |
|---|---|---|
| **Auth / sessions** | `apps/api/src/lib/session.ts`, `middleware/{auth,csrf}.ts`, `routes/auth.ts`; `src/lib/{auth.tsx,api.ts,session-storage.ts}`; `SessionsCard`, `AccountSecurity` | Cookie only; the browser holds just a marker. A 401 from a non-credential endpoint fires `go:session-expired` (local sign-out). Wrong *current* password on `/auth/password` is **403**, never 401. Device limit 5, login log 90 days without IP. The sandbox preview proxy strips `Cookie`/`Authorization`: `ALLOW_HEADER_SESSION=true` (body token + `X-Session-Token`) and `COOKIE_SAMESITE=none` are set by `scripts/preview.sh` – **never in production**. |
| **Operator & forced password** | `lib/operator.ts`, `cli/admin-create.ts`, `AccountSecurity.tsx` (`ForcedPasswordChange`) | No password argument; one-time password printed once; first login forces a change (403 `password_change_required` elsewhere). Run the CLI via the compiled `dist/cli/admin-create.js` (no root `tsx`); the API env is strict unless `API_EMBEDDED=true`. |
| **Realtime / chat** | `apps/api/src/realtime/`, `routes/{chat,realtime}.ts`, `lib/notify.ts`; `src/lib/{realtime.ts,realtime-context.tsx}`, `useRealtimeBridge` | Events are tiny (IDs) and mapped to data refreshes in `src/data/hooks.ts`. Production needs `scripts/server.mjs`: it sets `app.didWebSocketSetup = true` (a Next internal) because Next otherwise attaches an `upgrade` listener that closes foreign sockets. `next dev` / serverless → SSE only. WebSocket auth: cookie, or first message `{type:"auth",token}` with `ALLOW_HEADER_SESSION`. Smoke test: `node .archive/diag/realtime-smoke.mjs <base-url> [ws\|sse]` (local, untracked). |
| **Community moderation** | `lib/moderation.ts`, `routes/{moderation,communities}.ts`; `src/components/community/*`, `CommentsSheet` | Read community content only via `loadPostForViewer`/`communityId` filter. One report per person and item (re-reporting is impossible by design). Moderation notifications use type `system`. Roles: moderator + admin hide/kick (moderators only members, never admin content); only admins appoint moderators and manage bans. |
| **Rate limits** | `middleware/rate-limit.ts`, table `rate_limits` | Shared across instances; in-memory fallback if the DB fails. `TRUST_PROXY=false` ignores `X-Forwarded-For`; `RATE_LIMIT_DISABLED=true` (E2E only). |
| **Routing / 404** | `src/lib/{routes,nav}.ts(x)`, `app/[[...slug]]/page.tsx`, `app/not-found.tsx`, `public/sw-policy.js` | A new view with a URL needs a segment in `routes.ts` **and** `appSegments` in `sw-policy.js` (test enforces it), else 404. Malformed percent-encoding returns 400 only through `scripts/server.mjs`. After moving files in `app/`: `rm -rf .next/types .next/dev`. |
| **Versioning / updates** | `version.json`, `scripts/version.mjs`, `app/api/version/route.ts`, `src/lib/{update-logic.ts,update.tsx}`, `UpdateUI.tsx` | Build ID (random) drives update detection, the `YYMMDDHH` build number is display-only. Release notes are published in Dev-Admin → Updates (`/releases`, migration 0005). |
| **Feature flags** | `src/config/features.ts`, `apps/api/src/lib/{feature-keys,features}.ts`, `feature_flags` table | Global flags enforced server-side (403 `{feature}`); key parity tested. Core features cannot be disabled (409). |
| **Embedded API / env** | `app/api/[...route]/route.ts`, `src/server/embedded-api.ts`, `next.config.ts` | Migrations run on the first request. `NEXT_PUBLIC_API_URL` is baked in at build time. Without `JWT_SECRET` production aborts (503) unless `ALLOW_EPHEMERAL_JWT_SECRET=true`. The root `package.json` repeats the API runtime packages – **bump both**. |
| **Media / uploads** | `routes/media.ts`, `lib/s3.ts` + `/upload/presign` in `app.ts`, `src/lib/media.ts`, `src/components/media.tsx` | Images live in PostgreSQL (magic-byte check, 2 MB, quota 200 images/100 MB per user); clients shrink to 1600 px (strips EXIF). Show stored `/media/<id>` via `resolveMedia()`. S3 presign signs against `S3_PUBLIC_ENDPOINT` – never rewrite the host afterwards. |
| **Demo-data rule** | `src/lib/config.ts` (`useMock`) | Demo data from `src/mocks/data.ts` only when `useMock`; otherwise real data or an honest empty state. `Avatar` always gets `name` (initials fallback). |
| **PWA cache** | `public/sw.js`, `public/sw-policy.js` | Only an explicit public allowlist is cached; never APIs, signed URLs or private responses. `cache-policy.test.ts` executes the real policy. |
| **Drizzle** | `apps/api/src/db/schema.ts`, `drizzle/` | Every `many()` relation needs its inverse or `db.query.*` fails. Migrations are handwritten (see `CLAUDE.md`). |

---

## 4. Pitfalls

- **Build/ops:** `npm run build:vite` does not typecheck, and no frontend build covers `apps/api` – run both checks. `NEXT_PUBLIC_API_URL` is baked in at build time.
  `npm install`/`npm ci` inside `apps/api` creates a second `drizzle-orm` and breaks the root typecheck/build (TS2345): `rm -rf apps/api/node_modules apps/api/dist` afterwards.
  The preview serves the built `.next`; never start `npm run preview` in parallel with `npm run build`. Binary assets must be checked when committing (a deleted `src/assets/hero.jpg` once broke both builds).
  `Math.min(...arr)` crashes on empty arrays – guard charts.
- **CSS/layout pitfalls** (units on custom properties, `overflow-x: clip`, Tailwind `source(none)` …): `DESIGN.md`. **Test pitfalls:** `docs/TESTING.md`.
- **Touch UX – do not roll back:**
  - Swipe-to-dismiss works on the whole panel (Drawer, BottomSheet, mobile Modal; `useSwipeToDismiss`), only in the closing direction and only when content is scrolled to the top; form fields, sliders and `[data-no-swipe]` never start a gesture; no Framer `drag` on scrollable panels.
  - Page gestures (`usePageSwipe`): lower zone switches bottom-nav tabs, middle zone swiping right goes back; inactive with open dialogs, in horizontal scrollers and forms; in-page tabs use `useSwipeTabs`.
  - Sliders change value only after a clearly horizontal move or a tap; do not revert to native range touch behavior.
  - Long-press cancels after 10 px of movement; pull-to-refresh is off in overlays and form fields; scroll lock is ref-counted and iOS-safe; edge swipe is disabled on iOS (system back).
  - `SwipeLightbox` is full-screen (own portal): swipe to browse, down to close, double tap to zoom, arrows/Esc.

---

## 5. Known limitations and open items

Full list with priorities: `TODO.md`. Release gates (audit, uploads, Docker …): `docs/TESTING.md` §6.

- Docker stack, MinIO and the compose `admin` service are untested; real iOS/Android behavior is untested.
- No data source yet (empty states in API mode): cost/consumption, AI chat (UI only, no server proxy), soil recipes, stories, strain ratings.
- Accounts: password reset and e-mail confirmation exist (B-87) but only work once SMTP is configured; without it members cannot reset (operators can, via CLI); online status cannot be hidden.
- Vercel (B-66): see `ARCHITECTURE.md` "Serverless deployment". `DB_POOL_MAX`, `SKIP_MIGRATIONS`, `NEXT_PUBLIC_REALTIME` (polling is the default on Vercel builds). 503 `Backend nicht verfügbar` = boot failure, read `embedded_api_boot_failed` (`causeCode`). Not verified under load on Vercel.
- Selection (B-68): the whole UI is `user-select: none` except inputs/textareas (owner decision, to stop Chrome Android's "Suchergebnisse anzeigen" bar); content cannot be copied by selecting. `api_error` logs `code`/`path`/`cause` — use it to find the cause of 500s on Vercel (open).
- Weekly report (B-71): opt-in per account; needs `CRON_SECRET` in the host environment (`GET /api/cron/weekly-report`, Vercel Cron in `vercel.json`, Sundays 17:00 UTC); without it the route is 404. Device-only settings (reduce motion, sounds) live in `localStorage`. Never verified end to end on a real host or device.
- Mobile (B-67): below 1024 px an open chat is a fullscreen portal (`data-testid="chat-fullscreen"`, z-45); zoom is disabled via viewport meta + `touch-action`; `translate="no"`. Verified only in Chromium emulation (Pixel 5), not on real Android/iOS devices or with the on-screen keyboard.
- Group chats (B-65): invitation-only, max 20 members incl. open invitations, topics (private/admins-only/closed/pinned/muted). No group deletion and no explicit admin promotion yet; the demo mode has no groups. Not tested on real devices (group push, small screens beyond the E2E viewport).
- Web push (B-63): delivery to real devices (Android, iOS PWA, lock screen) has never been observed; the sandbox cannot reach a push service. Without `VAPID_*` env vars push is off (the settings card says so).
- Moderation covers community content only (not the global feed or the forum); no "leave community"; the report queue is capped at 100; the community feed does not update live.
- Routing: no SSR/file-based routing per view (the shell is client-side); wiki/showcase/marketplace details partly have no own URL; a 404 behind a reverse proxy with its own error page is untested;
  PWA offline deep links (incl. `/strains/<id>`) and the legacy Vite build are not browser-tested.
- Hosting: serverless platforms have no WebSocket (SSE only); realtime behind nginx/Traefik and with several real instances is untested.

## Workspace budget (sandbox)

The agent sandbox snapshot is capped at about 128 MB / 10,000 files. To stay below it:
- `promo-kit/` and `promo/` (about 70 MB, committed on `A`/`main`) are hidden locally with `git sparse-checkout` (`/*`, `!/promo-kit/`, `!/promo/`). Nothing changes in the repo; show them again with `git sparse-checkout disable`. While hidden, `npm run docs:check` reports the promo-kit links as broken (CI has the full checkout).
- `.git` is a blobless clone (`--filter=blob:none`): history and branches are complete, large files are fetched from GitHub on demand.
- Test logs, `test-results/`, build output and downloaded Vercel/Supabase exports stay out of `/home/user` (use `~/.cache/pm/`); `uploads/` is git-ignored.
- `.archive/` (git-ignored) holds `docs-umbau/` and the packed old leftovers `archiv-rest.tar.xz`.

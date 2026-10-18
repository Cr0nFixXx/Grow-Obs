# Testing and Verification

What is verified, how to run it, and what is still unverified. **Measured results only** – a check counts as passed only if the
command actually ran (see `CLAUDE.md`). Per-task history with numbers lives in `docs/CHANGELOG.md`.

## 1. Current status

Last full run: **B-62** (HEAD `b369275`, build `26101714`), Node 22.23, PostgreSQL 17.

| Check | Command | Result |
|---|---|---|
| Route types | `npx next typegen` | ✅ |
| Typecheck (frontend) | `npm run typecheck` | ✅ |
| Lint | `npm run lint` | ✅ |
| Frontend unit/component tests | `npm test` | ✅ 181 / 181 (28 files) |
| API typecheck | `npm run typecheck --prefix apps/api` + `npx tsc -p tsconfig.tools.json` (in `apps/api`) | ✅ |
| API integration tests | `npm run test:api` | ✅ 155 / 155 (last run at B-61; no API change since) |
| Browser E2E (Playwright) | `npm run test:e2e` | ✅ 37 / 37 (desktop 36 + mobile 1, ≈ 5 min) |
| Next.js build | `npm run build` | ✅ |
| Vite legacy build | `npm run build:vite` | ✅ (last run at B-61) |
| Version consistency | `npm run version:check` | ✅ |
| Dependency audit | `npm audit --package-lock-only` | see §6 |

**Never run / not verifiable here:** Docker Compose stack (incl. the `admin` tools profile), MinIO uploads, real iOS/Android touch
behavior, reverse proxies in front of the realtime endpoints, a CI run on the hosting platform (the workflow exists, nobody observed it run).

## 2. Prerequisites and commands

- **Node 22**, PostgreSQL 16+ (measured with 17), `npx playwright install chromium` once for E2E
  (Linux may additionally need `npx playwright install-deps chromium`).
- Disposable databases for a role `grow_test` (password `grow_test`): `growobserver_test` (API tests) and `growobserver_e2e` (E2E).
  **The API suite deletes data in its database and the E2E suite creates users – never point either at a real installation.**
  The API suites throw if the database name does not end in `_test`.

```bash
# Frontend
npx next typegen && npm run typecheck && npm run lint && npm test

# API
npm run typecheck --prefix apps/api
(cd apps/api && npx tsc -p tsconfig.tools.json)      # seed, drizzle config, tests
TEST_DATABASE_URL=postgres://grow_test:grow_test@127.0.0.1:5432/growobserver_test npm run test:api
npx vitest run -c vitest.backend.config.ts apps/api/tests/<file>   # single file
npm run test:api:local        # creates and drops a throwaway DB (needs a local PostgreSQL superuser)

# Browser E2E (production build + scripts/server.mjs on port 3100)
npm run build && npm run test:e2e
npx playwright test e2e/<file> --project=desktop     # single spec

# Builds and consistency
npm run build && npm run build:vite && npm run version:check
```

CI (`.github/workflows/ci.yml`) has three jobs: frontend (peers, version, typegen, typecheck, lint, tests, both builds), API (typecheck, build, integration tests
against PostgreSQL) and E2E (Playwright).

## 3. What is covered

**Frontend (Vitest, `src/**/*.test.ts[x]`)** – API client (no-store, cookie credentials, redirects, timeout, 204), service-worker cache policy
(executes `public/sw-policy.js`: APIs, signed URLs, external media and private/error responses never enter the cache; route list in sync with `routes.ts`),
auth provider (fail-closed restore, late responses cannot undo logout, marker instead of token, 401 event), `useResource` (last request wins, refresh keeps data),
feature flags (key parity with the API, malformed overrides), routing (`routes.ts`, `nav.tsx`), realtime transport and context, version/build number,
update logic, gestures and touch hooks, charts, formatting, UI primitives, account security forms, new-chat dialog, community moderation UI, mock services.

**API integration (`apps/api/tests`, real PostgreSQL via `app.request()`)**

| Suite | Covers |
|---|---|
| `environment.test.ts` | environment validation, production HTTPS rules |
| `migrations.test.ts` | migration journal consistency (gapless, ascending timestamps, file present) and the SQL content of migrations 0006–0012 |
| `security.integration.test.ts` | upload authorization, chat membership, private discovery, invite expiry/hash/parallel redemption, last-admin protection, DB role beats JWT role, admin contracts, registration normalization |
| `sessions.integration.test.ts` | cookie flags, revocation, expiry, foreign `sid`, device list, CSRF, CORS credentials |
| `password.integration.test.ts` | password change (other sessions ended, wrong password 403), login history without IP (90 days), device limit 5 |
| `password-enforcement.integration.test.ts` | forced password change: flag, locked endpoints, unlock after change |
| `operator.integration.test.ts` | `admin:create` (new, `--promote`, `--reset-password`, errors, idempotency) |
| `rate-limit.test.ts` | shared counter: atomicity, two module instances, window expiry, hashed keys, DB-failure fallback |
| `realtime.integration.test.ts` | LISTEN/NOTIFY delivery, SSE and WebSocket auth/limits, chat API, typing, presence, notifications |
| `moderation.integration.test.ts` | community feed scope, hide/unhide, reports and queue, kick/ban matrix, role assignment |
| `version.test.ts` | `/version`, module inheritance |

**Browser E2E (`e2e/*.spec.ts`, Playwright, production build)**

| Spec | Covers |
|---|---|
| `app.spec.ts` | version display, register/reload/logout/login, wrong password, terms consent, create grow, forum thread, deep link, no demo data in API mode |
| `session.spec.ts` | HttpOnly cookie, server-side revocation, two devices, "all devices", auto sign-out, CSRF, password change |
| `forced-password.spec.ts` | one-time password locks the app until changed |
| `routing.spec.ts` | address follows view, reload/back/forward, grow detail, deep link after login, profile tab, legacy `?view=`, `/api` untouched, HTTP 404/400, strain URL |
| `realtime.spec.ts` | chat live (WebSocket), SSE fallback, forum comments and bell live |
| `moderation.spec.ts` | community feed, report, queue, hide, kick with ban, unban |
| `mobile.spec.ts` | Pixel 5: bottom navigation, menu, no horizontal overflow |

## 4. Test pitfalls

**Vitest (frontend)** – default environment is `node`: DOM tests need `// @vitest-environment jsdom`. There is no automatic RTL cleanup (call `cleanup()`).
`useServices` mocks must return a **stable** object. RTL `waitFor` hangs under fake timers. Modals need a `window.matchMedia` stub.
jsdom `history.back()` is asynchronous – use `vi.waitFor`.

**API tests** – files run sequentially (`fileParallelism: false`); a file that runs alone must migrate the DB in `beforeAll`
(`migrate(db, { migrationsFolder })`). Tests that `vi.resetModules()` and re-import create a second DB client – close it.
Drizzle wraps Postgres errors: the code is in `error.cause.code`. Root `tsc` does not catch what `tsc -p apps/api` /
`tsconfig.tools.json` catch. After `npm ci` inside `apps/api`, remove `apps/api/node_modules` and `apps/api/dist` before checking the frontend (duplicate `drizzle-orm`, TS2345).

**E2E** – needs a fresh `npm run build`; never run `npm run preview` in parallel with a build. The suite sets `RATE_LIMIT_DISABLED=true`
(it registers more than 10 accounts per hour); rate limits are covered by the API tests. Passwords need ≥ 12 characters. Skip onboarding first
("Überspringen"). Use `{ exact: true }` for ambiguous names ("Senden", "Feed" collides with "Community-Feed"). Clipboard tests need
`context.grantPermissions(["clipboard-read","clipboard-write"])`. After moving files in `app/`, remove stale route types: `rm -rf .next/types .next/dev`.

## 5. Manual acceptance (not automated)

1. Start `npm run preview`. Upgrade from an older service worker: old `go-shell-*` caches disappear.
2. Log in, open private data, log out, log in as another account: no earlier private response may come from Cache Storage; back/refresh must not reopen the old account.
3. Dev-Admin as a member: no admin page or API data. As platform admin: DB/storage status comes from `/admin/health`.
4. Stop PostgreSQL and MinIO separately: the affected dependency shows a failed check.
5. Redeem a one-use invite from two accounts concurrently: exactly one membership.
6. Android Chrome / iOS Safari at 320/375/414 px and landscape: sheet scrolling, handle drag, drawer scroll, keyboard, the new community tabs.
7. Lightboxes: short drag snaps back, fast flick changes the image, down swipe closes; the close button always stays reachable.
8. Offer ticker on a coarse-pointer device: manual horizontal snap, no autoplay; desktop keeps the marquee.
9. Realtime behind nginx/Traefik (Upgrade headers, no buffering for SSE) and PWA offline deep links such as `/strains/<id>`.

## 6. Open release gates

- **Docker/MinIO stack** (Compose, `admin` profile, presigned uploads) never run.
- **Dependency audit** (measured 2026-10-18, `npm audit --package-lock-only`): root 3 high – all through `vite-plugin-singlefile`
  (legacy Vite build only; fix available in 2.3.4); `apps/api` 4 moderate – `drizzle-kit`/`esbuild` (dev/CLI only). **Production dependencies: 0 advisories** in both packages.
- **Upload hardening:** magic-byte check, size quota and client-side EXIF removal exist; missing: malware scan, server-side re-encoding, download authorization for private images, cleanup of orphaned uploads.
- **Durable audit records:** feature flags keep only `updated_by`/`updated_at`.
- **Populated installation:** migration of an existing, filled installation (beyond the automated upgrade test) and pinned container image digests.
- **Realtime:** several real API instances and real reverse proxies are untested (delivery runs over the same NOTIFY chain the tests cover).

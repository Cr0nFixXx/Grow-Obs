# Testing And Verification

## Status

**B-42 (Claude / Anthropic) – actually executed, all green (Node 22, PostgreSQL 16):**
`npx next typegen`, `npm run typecheck`, `npm run lint` (0 errors / 0 warnings), `npm test`
(52/52), `npm run build` (Next.js), `npm run build:vite` (870.33 kB / 312.65 kB gzip),
API `npm run typecheck`, `npx tsc -p tsconfig.tools.json`, `npm run build`,
`npm run test:api` (13/13 against a throwaway `growobserver_test` DB), smoke test of `next start`
(`/`, `/api/health`, CSS, `sw.js`, manifest).

**B-43:** same suite re-run after cleanup, plus `npm ci` from the lockfile (clean install).

**B-44:** 61/61 unit tests (new: `src/lib/gestures.test.ts`, `src/services/mock-create.test.ts`). Gesture
behaviour itself (touch, scroll hand-over, tab swipe vs. edge swipe) still needs real-device checks.

**B-45:** API integration 15/15 (new: task isolation, strain/wiki authoring). Migration upgrade path
0000 → 0001 verified on a database containing data. `npm audit`: frontend 0; API 4 moderate
(drizzle-kit's bundled esbuild, CLI-only). Fresh `npm ci` from the new lockfile succeeds.

**B-46 (embedded API):** real `next start` against PostgreSQL: first request runs migrations
(26 tables); register → task + grow → server restart → login → data still present; `401` without token;
upload presign `503` without storage. All 37 endpoints used by `src/services/api.ts` return 2xx against
the seeded sandbox DB (contract data removed afterwards). Browser click-through in API mode still pending
(no headless browser available in this sandbox).

**B-47:** API 20/20 (media magic bytes/size/owner delete/headers, grow photo ownership, chat image,
profile edit without role escalation, per-user strain collection). Frontend 64/64. Live check against
the preview (upload → serve → attach) documented in PROGRESS. Real-device camera upload untested.

**B-48:** API 22/22 (vote toggle incl. `myVote`, anonymous listing, threaded replies, comment votes,
hall/post comments with counts). Frontend 71/71 (swipe zones, remember-me storage, notification targets,
mock forum/comments). Real-device checks pending: slider vs. scroll, page swipe zones, install prompt.

**B-49:** API 23/23 (flags: non-admin 403, core 409, unknown 404, other user sees override, API route
blocked with `feature`, reset). Frontend 76/76 (key parity, `refreshAllResources` background reload,
failure keeps content, unmount cleanup). Live: admin disables feature → second account blocked (see PROGRESS).

**B-50:** API 24/24 (releases: admin-only, validation, public order, delete). Update logic unit-tested
(available/mandatory/unseen/prefs/auto-apply). Two consecutive production builds verified: client bundle
build ID matches `/api/version`, and a new build is reported as a different ID.

**Still unverified:** Docker Compose stack, MinIO upload, browser E2E in API mode, real-device
gesture tests, `npm audit` advisories.

## Frontend

Run from the repository root with Node 22:

```sh
npm install
npx tsc --noEmit
npx vitest run
npm run build
```

Regression coverage added in this iteration:

- `src/lib/api.test.ts`: no-store, bearer scope, redirects, readable failures, timeout and 204.
- `src/lib/cache-policy.test.ts`: executes the actual `public/sw-policy.js`; APIs, signed URLs,
  external media, authenticated requests and private/error responses never enter the shell cache.
- `src/lib/diagnostics.test.ts`: liveness does not imply DB health; demo checks stay unknown.
- `src/config/features.test.ts`: malformed overrides cannot disable core features.
- `src/lib/auth.test.tsx`: session restoration is fail-closed; late responses cannot undo logout.
- `src/data/useResource.test.tsx`: last-request-wins; refresh errors do not discard visible data.
- `src/lib/touch-hooks.test.tsx`: gestapelte Scroll-Locks und Long-Press-Abbruch beim Scrollen.
- Existing format and chart-path tests remain in place.

## API Integration

Use a dedicated disposable PostgreSQL database whose name ends in `_test`.
**The integration suite truncates its test data. Never point it at a real installation.**

`vitest` is an `apps/api` devDependency, and `tsconfig.tools.json` includes `tests/`, so the
integration suite is typechecked together with `seed.ts` and `drizzle.config.ts`.

```sh
npm install --prefix apps/api
npm run typecheck --prefix apps/api        # runtime code (src/)
cd apps/api
npx tsc -p tsconfig.tools.json             # seed + drizzle.config + tests
cd ../..
TEST_DATABASE_URL=postgres://grow_test:grow_test@127.0.0.1:5432/growobserver_test \
  npx vitest run --config vitest.backend.config.ts
```

The suite applies the committed initial migration and exercises `app.request()` against real
PostgreSQL. It covers anonymous/unauthorized uploads, chat membership, private discovery,
invite expiry/hash storage, parallel redemption, last-admin protection, revoked JWT roles,
admin content contracts and registration normalization.

It does not open a TCP server or complete a MinIO upload. Separate smoke checks must cover the
compiled Node entry, TLS/CORS, browser uploads, database/storage failure reporting and backups.

CI (`.github/workflows/ci.yml`) has separate frontend and API jobs. A configured job is not
proof that it has run successfully. Record the actual run/result before approving a release.

## Manual Acceptance

1. Build the frontend, serve the whole `dist/` directory over HTTPS or localhost.
2. Upgrade from a previous service worker and verify old `go-shell-*` caches disappear.
3. Log in to the API, open private data, log out, then log in as another account. No prior private
   response may be served from Cache Storage. Back/refresh must not reopen the old account.
4. Open Dev-Admin as a member: no admin page or API data. Open it as a platform admin:
   DB/storage status must come from `/admin/health`, not `/health`.
5. Disconnect PostgreSQL and MinIO separately: the affected dependency must show a failed check.
6. Test an invite from two accounts concurrently; exactly one new membership for a one-use code.
7. On Android Chrome/iOS Safari, test sheet scrolling, handle drag, drawer scroll, keyboard,
   landscape and 320/375/414 px widths. These are still unverified on devices.
8. Test Grow/Hall lightboxes: short drag snaps back, fast flick changes image, down swipe closes;
   browser zoom/OS gestures must not trap the user (close button remains available).
9. Test the offer ticker on a coarse-pointer device: no autoplay, manual horizontal snap works,
   no duplicate items; desktop retains the marquee.

## Remaining Release Gates

- Complete dependency audit. The last package installation reported 9 advisories
  (1 low, 4 moderate, 4 high); no detailed audit or remediation was possible in this tool session.
- Commit/review backend lockfile and pinned container digests in a normal development environment.
- Auth/abuse rate limiting, session revocation strategy and security review.
- Upload finalization with MIME sniffing, size recheck, EXIF removal and malware scanning.
- Backend-managed feature flags and durable server-side audit records.

Maintainer for this update: Codex (OpenAI).
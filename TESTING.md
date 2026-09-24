# Testing And Verification

## Status

The test suites below are implemented, not yet executed in this agent environment.
Frontend build B-38 succeeded: 862.56 kB HTML / 310.29 kB gzip.
The available build tool checks the Vite frontend bundle only. It does not run TypeScript,
Vitest, the Hono API, PostgreSQL, MinIO, Docker or real-device gesture tests.

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
- Existing format and chart-path tests remain in place.

## API Integration

Use a dedicated disposable PostgreSQL database whose name ends in `_test`.
**The integration suite truncates its test data. Never point it at a real installation.**

```sh
npm install --prefix apps/api
npm run typecheck --prefix apps/api
cd apps/api
npx tsc -p tsconfig.tools.json
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

## Remaining Release Gates

- Complete dependency audit. The last package installation reported 9 advisories
  (1 low, 4 moderate, 4 high); no detailed audit or remediation was possible in this tool session.
- Commit/review backend lockfile and pinned container digests in a normal development environment.
- Auth/abuse rate limiting, session revocation strategy and security review.
- Upload finalization with MIME sniffing, size recheck, EXIF removal and malware scanning.
- Backend-managed feature flags and durable server-side audit records.

Maintainer for this update: Codex (OpenAI).
# TODO.md

Open work on **Grow|Observer**, by priority. Roadmap and decisions: `PLAN.md`; current state: `HANDOFF.md`; measured test status and release gates: `docs/TESTING.md`.
Legend: `[ ]` open · `[~]` in progress. Finished items are removed here and recorded in `docs/CHANGELOG.md`; the old checklist (v0.1–B-62, mostly finished) is kept in `docs/archive/TODO-bis-B62.md`.

The owner decides the order. Last update: B-62.

---

## 1. Feature candidates (next up)

- [ ] **AI proxy:** server-side, per feature flag; the assistant UI is not connected yet (`PLAN.md` P9).
- [ ] **Password reset for regular members:** needs an email path or another recovery concept (today only operators can reset, via CLI).
- [ ] **Hide online status:** per-user option (presence is currently always visible).
- [ ] **Group chats:** backend supports conversations with several members; no UI to create them.
- [ ] **Web push, follow-ups:** real-device acceptance (Android, iOS PWA), PNG app icons for the notification (`/icon-192.png` is referenced by the manifest but not in the repo), push for further triggers (task reminders, community invites), per-conversation mute.
- [ ] **Moderation beyond communities:** global feed and forum (report, hide); **leave a community**; **paginate** the moderation queue (capped at 100); **live updates** of the community feed.
- [ ] **Detail URLs** for wiki, showcase and marketplace (`src/lib/routes.ts` + `public/sw-policy.js`).

## 2. Data sources missing (empty states in API mode)

- [ ] Cost and consumption data (cost card hidden, consumption page shows an empty state).
- [ ] Soil recipes, stories, strain ratings/reviews.
- [ ] AI chat history (input is disabled with an honest notice until the proxy exists).

## 3. Quality and release gates

- [ ] **Docker/MinIO stack:** run `docker compose up`, the `admin` tools profile and a presigned upload end to end (never run).
- [ ] **Dependency audit:** root 3 high via `vite-plugin-singlefile` (upgrade to 2.3.4 or drop the legacy build), `apps/api` 4 moderate via `drizzle-kit`/`esbuild` (dev/CLI only); production dependencies are clean (`docs/TESTING.md` §6).
- [ ] **Upload hardening:** malware scan, server-side re-encoding, download authorization for private images, cleanup of orphaned uploads, S3 finalization.
- [ ] **Durable audit records** (feature flags keep only `updated_by`/`updated_at`), real account suspension, rollout by user group/percentage.
- [ ] **Migration of a populated installation** (beyond the automated upgrade test) and **pinned container images** (`MINIO_IMAGE` is `latest`).
- [ ] **Real-device acceptance:** iOS Safari / Android Chrome touch, keyboard, landscape; mobile layout of the community tabs.
- [ ] **Realtime in production-like setups:** behind nginx/Traefik, with several real API instances.
- [ ] **PWA/legacy:** offline deep links (incl. `/strains/<id>`), 404 behind a reverse proxy with its own error page, legacy Vite build in a browser.
- [ ] **E2E gaps:** social feed posting, Dev-Admin, wiki/strains, uploads; Docker stack with `NEXT_PUBLIC_API_URL`.
- [ ] **PWA hardening:** offline queue and sync (`PLAN.md` P10).

## 4. Engineering backlog

- [ ] Split `src/components/ui.tsx` and `src/components/layout/AppShell.tsx` (large files; deliberately postponed).
- [ ] Optional: file-based routing per view and `apps/web` monorepo (`PLAN.md`); afterwards remove the legacy Vite build.
- [ ] Hosting without WebSocket (serverless) works through SSE only; revisit if such hosting becomes a target.
- [ ] `scripts/server.mjs` relies on the Next internal `didWebSocketSetup`; re-check on every Next upgrade. The 400 guard for malformed URLs exists only in this server.

## 5. Later (north star, `docs/MILESTONES.md`)

- [ ] Editions Free/Pro/CSC/Enterprise · [ ] local-first storage + E2EE + tombstones · [ ] native Android/iOS · [ ] in-app purchases / paywall

---

## Recently finished (details in `docs/CHANGELOG.md`)

- B-62 real 404 page and strain detail URL · B-61 community moderation · B-60 shared rate limit · B-59 chat and realtime · B-58 forced password change
- B-57 URL routing · B-56 operator bootstrap CLI · B-55 password change, login history, device limit · B-54 session hardening (HttpOnly cookie, server-side revocation)
- B-53 no demo data in API mode · B-52 central versioning · B-51 rate limits, JWT requirement, Playwright E2E

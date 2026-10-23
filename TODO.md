# TODO.md

Open work on **Grow|Observer**, by priority. Roadmap and decisions: `PLAN.md`; current state: `HANDOFF.md`; measured test status and release gates: `docs/TESTING.md`.
Legend: `[ ]` open · `[~]` in progress. Finished items are removed here and recorded in `docs/CHANGELOG.md`; the old checklist (v0.1–B-62, mostly finished) is kept in `docs/archive/TODO-bis-B62.md`.

The owner decides the order. Last update: B-62.

---

## 1. Feature candidates (next up)

- [ ] **AI proxy:** server-side, per feature flag; the assistant UI is not connected yet (`PLAN.md` P9).
- [ ] **Password reset for regular members:** needs an email path or another recovery concept (today only operators can reset, via CLI).
- [ ] **Profile rounds (B-73 done):** B-74 account (change e-mail with password, delete account + JSON export, last platform admin cannot delete), B-75 notifications (bundle weekly report, push categories, quiet hours + in-app bell mute per category), images (avatar/cover) once Supabase Storage keys exist; link forum authors to `/u/<handle>` (needs the handle in the forum API).
- [ ] **Hide online status:** per-user option (presence is currently always visible).
- [ ] **Images (B-78 done for profile images + daily sweep):** other replace spots (grow cover, hall entry, group avatar) rely on the sweep (24 h); new image columns must be added to `MEDIA_REFERENCES`. Pooler: stay on the session pooler (the transaction pooler hung in B-77); occasional 500 `XX000` under parallel load remain until the move to own hosting.
- [ ] **Move to own hosting (owner's plan):** realtime via WebSocket/`LISTEN` works there (standalone/Docker stack, session semantics); then re-check `MEDIA_STORAGE` (MinIO or the Supabase bucket), the cron jobs (`weekly-report`, `media-cleanup` need an external scheduler) and the Vercel-only settings (`SKIP_MIGRATIONS`, `DB_POOL_MAX=1`).
- [ ] **Vercel operation (B-66):** watch the pooler after `DB_POOL_MAX`/polling; optional presence for polling-only mode (a cheap `POST /presence` ping), a documented `docs/` deployment guide if Vercel becomes a supported target.
- [ ] **Group chats (B-65 done):** follow-ups: group deletion by an admin, explicit admin promotion, per-topic message search, invitation links (deliberately not built), real-device check of the group push.
- [ ] **Web push, follow-ups:** real-device acceptance (Android, iOS PWA), push for further triggers (task reminders, community invites), per-conversation mute.
- [ ] **Moderation beyond communities:** global feed and forum (report, hide); **leave a community**; **paginate** the moderation queue (capped at 100); **live updates** of the community feed.
- [ ] **Weekly report (B-71 done):** follow-ups: per-user time zone and send time (today fixed Sunday ≈ 18:00 Berlin), a "send test report" button, an external-cron note for self-hosting in a deployment guide, real-device check of the push; **Telegram bot** setting was removed from the settings (it had no effect), re-add it only together with a real bot integration.
- [ ] **Grow diary (next, owner's choice):** `grows.day`/`phase`/`progress` are stored values that nothing advances (derive from `start_date`); no edit/delete for grows and log entries, no harvest/close-out, no phase change; `grow_env` readings have no input form.
- [ ] **Detail URLs** for wiki, showcase and marketplace (`src/lib/routes.ts` + `public/sw-policy.js`).

## 2. Data sources missing (empty states in API mode)

- [ ] Cost and consumption data (cost card hidden, consumption page shows an empty state).
- [ ] Soil recipes, stories, strain ratings/reviews.
- [ ] AI chat history (input is disabled with an honest notice until the proxy exists).

## 3. Quality and release gates

- [ ] **Docker/MinIO stack:** run `docker compose up`, the `admin` tools profile and a presigned upload end to end (never run).
- [ ] **Dependency audit:** root 3 high via `vite-plugin-singlefile` (upgrade to 2.3.4 or drop the legacy build), `apps/api` 4 moderate via `drizzle-kit`/`esbuild` (dev/CLI only); production dependencies are clean (`docs/TESTING.md` §6).
- [ ] **Upload hardening:** malware scan, server-side re-encoding, download authorization for private images, cleanup of orphaned uploads, S3 finalization; account deletion (B-74) must also delete the user's notifications first (`notifications.user_id` FK does not cascade, found in the B-76 production test) and the S3 objects (B-76 done: images in the private bucket; still open: re-encoding, orphan cleanup, objects of deleted accounts → B-74).
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
- [ ] Chat attachments follow-ups (B-81): inline PDF preview, login-protected file/image delivery (today: unguessable UUID link), delete single messages with their attachments, voice messages, virus scan for ZIP.
- [ ] Re-run the full E2E suite with a longer timeout for `moderation.spec.ts` (first test hit 45 s once in a full run, passes alone in ≈ 29 s).

## 5. Later (north star, `docs/MILESTONES.md`)

- [ ] Editions Free/Pro/CSC/Enterprise · [ ] local-first storage + E2EE + tombstones · [ ] native Android/iOS · [ ] in-app purchases / paywall

---

## Recently finished (details in `docs/CHANGELOG.md`)

- B-81 chat image gallery, files and multiple attachments · B-80 pull-to-refresh, update only in automatic mode, upload stall retry
- B-62 real 404 page and strain detail URL · B-61 community moderation · B-60 shared rate limit · B-59 chat and realtime · B-58 forced password change
- B-57 URL routing · B-56 operator bootstrap CLI · B-55 password change, login history, device limit · B-54 session hardening (HttpOnly cookie, server-side revocation)
- B-53 no demo data in API mode · B-52 central versioning · B-51 rate limits, JWT requirement, Playwright E2E

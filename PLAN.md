# PLAN.md

Roadmap and binding decisions for **Grow|Observer**: *what* is built in *which order*. Open items in detail: `TODO.md` · current state: `HANDOFF.md` ·
how the code is built: `ARCHITECTURE.md` · product north star: `docs/MILESTONES.md`.

The owner decides the order of work. A phase counts as done only when its acceptance criteria are met **and measured** (`docs/TESTING.md`); code that exists is not the same as verified operation.
The full original plan with all task lists (P0–P10, host variants, schema sketches) is kept in `docs/archive/PLAN-bis-B62.md`.

---

## 1. Decisions (binding)

| Topic | Decision |
|---|---|
| Product now | Fully working **PWA** plus **self-hosted** backend. Editions, native apps, E2EE/P2P and in-app purchases are deferred (`docs/MILESTONES.md`) until after the PWA launch. |
| Hosting | Self-host: Docker Compose (app, PostgreSQL, MinIO optional). SaaS (Vercel/Neon) is optional, not the default. |
| App shape | **One npm project**, no pnpm monorepo, no `apps/web`: Next.js 16 shell in the repo root (SPA via `app/[[...slug]]`), the legacy Vite build only as fallback. The API lives in `apps/api` and runs **embedded** under `/api/*` (default) or **standalone** (Docker). |
| Database | PostgreSQL with Drizzle migrations (`apps/api/drizzle`, run automatically). |
| Auth | Own implementation: email + password (argon2), JWT with `sub` + `sid`, server-side `sessions` table, HttpOnly cookie. Not Auth.js. Details: `ARCHITECTURE.md` §3. |
| Realtime | Own hub on PostgreSQL `LISTEN/NOTIFY`; transport WebSocket → SSE → polling. No Socket.io, nothing that needs a separate worker. |
| Storage | MinIO / S3 with presigned uploads; without storage configured, uploads answer `503`. |
| AI | Provider calls only on the server; keys never in the client; behind a feature flag. |
| Flags | `src/config/features.ts` (file) with overrides in the Developer-Admin (role `platform_admin`). |
| Routing | Path URLs with `src/lib/routes.ts` as the single source (`public/sw-policy.js` must stay in sync, a test checks it). |
| Versions | Central `version.json`; **only the owner changes versions**; the build number is refreshed after every completed task. |

---

## 2. Phase status

Legend: ✅ done · ◐ partly · ○ not started · ✖ dropped or replaced.

| Phase | Topic | Status | Notes |
|---|---|---|---|
| P0 | Guardrails (build, docs, tests stay green) | ✅ | CI: frontend, API, E2E jobs. |
| P0b | Feature flags + Developer-Admin | ✅ | Releases/updates (B-48–B-50), flag overrides in the DB. |
| P1 | Views on the service layer | ✅ | Mock and API implementation behind one interface; demo data only in mock mode (B-53). |
| P2 | pnpm monorepo + `apps/web` | ✖ | Replaced by the Next shell in the repo root and npm (B-42/B-43). Moving to `apps/web` is optional (`TODO.md` §4). |
| P3 | File-based routing | ✅ | Solved differently (B-57/B-62): catch-all route, path URLs, real HTTP 404, strain detail URL. Per-view route files were not needed. |
| P4 | Backend foundation (`apps/api`) | ✅ | DB, auth, sessions, storage, CRUD, Docker files. Docker/MinIO stack itself never run. |
| P5 | Communities and realtime | ✅ | Communities with roles and invites, moderation (B-61), chat and realtime (B-59). Open: leave community, queue pagination, live community feed. |
| P6 | Social graph | ◐ | Feed, follow, likes, bookmarks work. Stories have no data source; global feed has no moderation. |
| P7 | Forum, chat, wiki, notifications | ◐ | All four work and are live-updated. Open: group-chat UI, web push, wiki/showcase/marketplace detail URLs. |
| P8 | Tools, marketplace, report, Telegram | ◐ | Calculator, simulation and read-only catalog exist. Open: saved calculator scenarios, user listings, server-side PDF report, Telegram bot (only a `telegram` setting flag exists). |
| P9 | AI assistant | ○ | UI exists, input disabled with an honest notice (B-53). Needs the server proxy, history, soil recipes. |
| P10 | Harden and launch | ◐ | Done: rate limits (shared, B-60), session hardening, E2E suite, CI, PWA shell. Open: observability, legal pages, TLS/backup concept, Docker validation, real-device acceptance, offline queue. |
| P11 | Entitlements / editions (UI gates) | ○ | Only the flag mechanism exists. |
| P12 | Local-first + E2EE | ○ | Spec in `docs/MILESTONES.md`. |
| P13 | Native Android (Expo) | ○ | After P12. |
| P14 | Stores + in-app purchases | ○ | After P13. |

---

## 3. Next steps

The concrete list with priorities is `TODO.md`. Suggested order for the next feature work, if the owner has no other preference:

1. **P10 gates first:** run the Docker/MinIO stack once, pin container images, check realtime behind a reverse proxy, real-device acceptance (these decide whether the PWA can launch).
2. **P9:** AI proxy (`POST /ai/chat`, server-side context, token budget and rate limit per user, history table, streaming into `AIAssistant`), then soil recipes (`soil_recipes` with `parent_id`, fork = insert, diff stays client-side).
3. **P8 remainder:** persist calculator scenarios, user listings (after profile/auth, which exist), server-side PDF report (auth-gated; no jsPDF in the client bundle), Telegram link with a signed token (bot token server-only).
4. **P7/P6 remainder:** group-chat UI, web push, moderation for global feed and forum, hide online status, password reset for members.
5. **P10 launch checklist:** observability (error tracking, request IDs), legal pages (terms, privacy, imprint), staging deploy with a production-like DB.

Launch checklist (all must be true): sign-up and login, grow CRUD, feed, one real AI call, installable PWA, error tracking live, staging deploy green.

---

## 4. Do-not list

- No Recharts and no jsPDF in the client while the bundle discipline holds.
- No secrets in the client or in `NEXT_PUBLIC_*`.
- No Socket.io on serverless hosting; no WebSocket assumption outside `scripts/server.mjs` (SSE fallback must keep working).
- No new direct mock imports in views: always service + hook; demo data only in mock mode.
- No unit-less CSS custom properties, no `overflow-x: hidden` on `body`, no root PostCSS config shared with Vite (`DESIGN.md`).
- No changes to versions, no push, no new editions/native work without the owner's explicit request.
- Do not start several phases "roughly" in parallel; finish and verify one, then move on.

---

## 5. Working protocol

Rules for every session (reading order, verification, doc upkeep) are in `CLAUDE.md`. After each completed task: update `docs/CHANGELOG.md`, `docs/PROGRESS.md`, `TODO.md`,
`docs/TESTING.md` and, if a phase changed, the table in §2.

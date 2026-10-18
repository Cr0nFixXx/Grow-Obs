# CLAUDE.md

Binding rules for AI agents and developers working on **Grow|Observer**. This file contains **rules, not status,
commands or explanations** – those live in the files linked in §5. Read first: `HANDOFF.md` (current state).

---

## 1. Owner rules (binding)

- **Versions** are controlled centrally by `version.json`. **Only the owner assigns versions** (frontend version, backend
  version, codename "Ruderalis" = frontend only). Change them only on explicit instruction, then run `npm run version:sync`.
  Never bump "out of habit". Details: `ARCHITECTURE.md` §7 (versioning).
- **Build number:** run `npm run version:build` after **every completed task** (format `YYMMDDHH`, Europe/Berlin).
- **Preview:** a preview must always be possible (`npm run preview`). In an agent sandbox start it as a background process
  and **share the current preview URL** the platform reports; never construct or reuse an old one. If none is reported, say so.
- **Documentation:** after every completed task update the docs (§5). Docs must reflect the *measured* state.
- **Unclear requirements:** ask first, do not assume.

## 2. Verification rules

- Use **Node 22**. A green Vite build is neither a typecheck nor an API/security test; run the frontend **and** the API checks.
- Record a check as passed only if the command actually ran. Docker/MinIO have never been run in this project's agent environments.
- Do not edit the same file in parallel. Do not dismiss lint messages as "stale" without checking them.
- Definition of Done: typecheck + lint + frontend tests + API tests (+ E2E when UI or API behavior changed) green, `npm run version:build`,
  preview running, docs updated. Commands: `README.md` (dev/build/preview) and `docs/TESTING.md` (checks).

## 3. Backend invariants (do not break)

- **Every new endpoint uses `requireAuth`** (or `optionalAuth` for public reads with personalization). `requireAuthAllowPending`
  is reserved for `GET /auth/me`, `POST /auth/password` and `POST /auth/logout-all` (forced password change, B-58).
- **Sessions:** HttpOnly cookie `go_session`; every request checks the `sessions` row; unsafe methods pass `csrfGuard`.
  The JWT role is **not** the authorization source – the DB role is.
- **Notifications** are created only via `createNotification` (`apps/api/src/lib/notify.ts`); `notifications.type` is one of `grow|task|forum|shop|ai|system`.
- **Community content** is read only through the visibility helpers in `apps/api/src/lib/moderation.ts` (`loadPostForViewer`, `communityId` filter):
  community posts are visible to members only, hidden items to the moderation only; otherwise 404.
- **Realtime events carry IDs only**; data is fetched through the authorized REST API.
- **Rate limits** go through `apps/api/src/middleware/rate-limit.ts` (shared via the `rate_limits` table).
- **Migrations** are handwritten SQL in `apps/api/drizzle/` plus a committed journal; there is **no Drizzle snapshot** – never run
  `db:generate` blindly, never replay `0000_initial.sql` on an existing database.
- **Relative imports in `apps/api` use the `.ts` extension** (the build rewrites them to `.js`); Turbopack cannot resolve `.js` imports.
- **Feature flags:** a new key goes into `src/config/features.ts` **and** `apps/api/src/lib/feature-keys.ts`
  (+ path mapping in `apps/api/src/lib/features.ts`); the parity test fails otherwise. UI flags are no security boundary.
- **Secrets** only in `apps/api/.env` (never committed); `.env.example` holds empty/`CHANGE_ME` values.
- **New URL/view:** register the path segment in `src/lib/routes.ts` **and** `public/sw-policy.js` (a test keeps both in sync), otherwise the server answers 404.

## 4. Code rules

- Icons only via `<Icon name="…" />`; register new icons in `src/components/Icon.tsx`.
- Image imports are rendered through `assetSrc()` (`src/lib/asset.ts`); uploaded `/media/<id>` paths through `resolveMedia()`.
- The current user comes from `useCurrentUser()` (`@/lib/auth`), never from the mocks. UI texts are German.
- More conventions, recipes and pitfalls: `DESIGN.md` (styling, layout), `ARCHITECTURE.md` (recipes), `HANDOFF.md` (build/ops pitfalls), `docs/TESTING.md` (test pitfalls).

## 5. Documentation map and upkeep

| File | Content | Language |
|---|---|---|
| `README.md` | Overview, setup, dev/build/preview commands, structure | German |
| `HANDOFF.md` | Current state, open items, pitfalls | English |
| `PLAN.md` | Roadmap, decisions, phase status | English |
| `TODO.md` | Open items by priority | English |
| `DESIGN.md` | Design system, styling conventions, layout pitfalls | English |
| `ARCHITECTURE.md` | Layers, modes, auth, realtime, moderation, routing, versioning, recipes | English |
| `apps/api/README.md` | Backend operation, endpoint contract (single source for endpoints) | German |
| `docs/TESTING.md` | Test status, check commands, coverage, test pitfalls | English |
| `docs/CHANGELOG.md` | What changed per task, incl. measured results | German |
| `docs/MILESTONES.md` | Product north star | German |
| `docs/archive/` | Superseded documents (not maintained) | – |

**After every completed task** update `docs/CHANGELOG.md` (entry incl. test numbers), `TODO.md`, `docs/TESTING.md` (status table, if numbers changed),
`HANDOFF.md` (only if state or an invariant changed) and `apps/api/README.md` (endpoint changes).
Single source per fact: versions → `version.json`, test numbers → `docs/TESTING.md`, endpoints → `apps/api/README.md`, current state → `HANDOFF.md`.
Living docs carry no agent signatures and no `v0.x` tags; history lives in `docs/CHANGELOG.md` and `docs/archive/`.

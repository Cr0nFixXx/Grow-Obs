# Grow|Observer API

Self-hostable Hono/PostgreSQL/Drizzle API with MinIO storage. The frontend still runs through
Vite; this package has its own runtime and typecheck. Current work is hardening, not a
production-readiness certification. Docker and integration tests have not been run here.

## Requirements

- Node 22 for local tools and the compiled runtime.
- PostgreSQL 16 and an S3-compatible private bucket.
- Docker Compose for the provided local stack.
- TLS reverse proxy, real secrets, backups and reviewed images before internet exposure.

## Local Docker Setup

```sh
cd apps/api
cp .env.example .env
# Generate separate secrets, for example: openssl rand -hex 32
# Fill JWT_SECRET, POSTGRES_PASSWORD and S3_SECRET_KEY in .env.
docker compose up --build
```

The supplied Compose stack is local by default and binds ports to `127.0.0.1`:

| Component | Local endpoint |
| --- | --- |
| API | http://localhost:8787 |
| API liveness only | http://localhost:8787/health |
| MinIO S3 API | http://localhost:9000 |
| MinIO administration | http://localhost:9001 |
| PostgreSQL | localhost:5432 |

Compose overrides database/storage hostnames to `db` and `minio` inside containers. The
browser must use `S3_PUBLIC_ENDPOINT`, not `http://minio:9000`. Presigned URLs are generated
for that exact browser-reachable endpoint; do not rewrite the hostname afterwards.

Startup order: healthy PostgreSQL -> committed migrations; healthy MinIO -> private bucket
initialization; API starts only after both one-shot jobs succeed. The API runs compiled JS as
a non-root user. It does not generate migrations, start a watch server or seed demo data.

### Embedded Mode (Next.js, B-46)

The same app is served by the root Next.js project under `/api/*` (`app/api/[...route]` →
`src/server/embedded-api.ts`). Migrations run on the first request. Object storage is optional there
(`API_EMBEDDED=true` → presign returns `503`). Seed an **empty** embedded database from `apps/api`:

```bash
export $(grep -v '^#' ../../.env | xargs) $(grep -v '^#' ../../.env.local | xargs)
API_EMBEDDED=true NODE_ENV=development ALLOW_DEMO_SEED=true \
SEED_ADMIN_EMAIL=admin@example.local SEED_ADMIN_PASSWORD='<min. 12 Zeichen>' npx tsx seed.ts
```

Relative imports use the `.ts` extension; `rewriteRelativeImportExtensions` emits `.js` into `dist/`.

### Realtime (B-59)

Chat, typing, presence, notifications and forum comments are pushed over **WebSocket** (fallback **SSE**, then client polling).
Events travel through **PostgreSQL `LISTEN/NOTIFY`**, so several API instances work without Redis (each instance serves its own
connections; payloads are IDs only, < 7.5 KB). Per account: max. 5 connections; sessions are re-checked every 25 s, so logout / "all devices" /
password change close live connections (code 4401).

- Embedded mode needs `scripts/server.mjs` (`npm start`) to accept WebSocket upgrades; with plain `next start`/serverless the client uses SSE.
- Standalone API (`node dist/index.js`) attaches WebSocket itself.
- **Reverse proxy:** forward `Upgrade`/`Connection` headers for `/realtime/ws` and disable buffering + use a long read timeout (>= 60 s) for
  `/realtime/stream` (nginx: `proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_buffering off;`).
- A load balancer in front of several instances needs no stickiness: SSE subscriptions are routed through NOTIFY as well.
- Smoke test: `PREFIX="" node ../../.archive/diag/realtime-smoke.mjs http://127.0.0.1:4000 ws|sse` (embedded: omit `PREFIX`).

### Optional Demo Seed

Set `SEED_ADMIN_EMAIL` and a unique `SEED_ADMIN_PASSWORD` of at least 12 characters. There is
**no hardcoded admin password**. Then, only on an empty development database:

```sh
docker compose --profile demo run --rm seed
```

The demo seed is transactional, development-only and opt-in. It includes an operator account,
catalog entries and example communities. It is not a production admin-provisioning workflow.

### Operator Bootstrap (B-56)

The first operator (`platform_admin`) is created deliberately, never automatically and without demo data:

```sh
# Docker (after migrations)
docker compose --profile tools run --rm admin --email operator@example.org [--name "Name"]
# Local / embedded (apps/api; needs the same env as the API, API_EMBEDDED=true avoids S3 settings)
npm run admin:create -- --email operator@example.org
# Promote an EXISTING account (explicit; ends all of its sessions, password unchanged)
npm run admin:create -- --email member@example.org --promote
```

A new account gets a random one-time password (24 characters) that is printed once; there is no `--password`
option (shell history). **The first login forces a password change** (`users.must_change_password`; until then the API
answers every endpoint except `/auth/me`, `/auth/password` and logout with `403 password_change_required`). The command is
idempotent and logs a `role_changed` event (device "Betreiber-CLI") in the login log.

```sh
# Locked-out operator: new one-time password, change forced again, all sessions ended
npm run admin:create -- --email operator@example.org --reset-password
```

### Local Node Setup

```sh
cd apps/api
npm install
cp .env.example .env
# Set DATABASE_URL, real secrets, and the local storage settings.
npm run typecheck
npx tsc -p tsconfig.tools.json
npm run db:migrate
npx tsx src/db/storage-init.ts
npm run dev
```

For the compiled runtime, the existing build emits `dist/index.js` with Node-compatible `.js`
imports. `npm start` then starts that file. `.env` loading is supported with Node 22; Docker
injects variables directly. Production browser origins and upload endpoints must be HTTPS.

## Database Changes

- `src/db/schema.ts` is the ORM schema.
- `drizzle/0000_initial.sql` is a handwritten initial migration, with a committed journal.
- It is for an **empty** database. Do not replay it over tables created by earlier untracked
  `drizzle-kit push` or generated migrations. Back up and baseline existing installations first.
- New migrations must be reviewed, committed and explicitly deployed. No generation on startup.
- The handwritten baseline has no generated Drizzle snapshot. Do not blindly run `db:generate`
  and apply duplicate CREATE statements. Establish a matching snapshot in a disposable database
  before adopting generated incremental migrations, or keep reviewed SQL migrations.

## API Contracts

All responses carry `Cache-Control: private, no-store`. A bearer JWT is required where shown.

| Method / path | Access / behavior |
| --- | --- |
| GET `/health` | Liveness only; does not imply DB/storage availability |
| GET `/version` | Public: backend version + build number (generated from the root `version.json`) |
| POST `/auth/register`, `/auth/login` | Credentials; role defaults to member; normalized email |
| GET `/auth/me` | Current session user including explicit `role` |
| GET/POST `/grows`, GET `/grows/:id`, POST `/grows/:id/logs` | Authenticated owner |
| GET/POST `/social/posts`, POST `/social/posts/:id/like` | Authenticated global feed (posts without community). `?communityId=` / body `communityId`: community feed, members only (B-61) |
| POST `/communities/:id/(posts/:postId|comments/:commentId)/(hide|unhide)` | Community moderator/admin; moderators cannot hide admin content; hidden items visible to moderation only |
| DELETE `/communities/:id/members/:userId` (`?ban=true`) | Moderator (members only) / admin (also moderators); never admins or self; optional permanent ban |
| GET `/communities/:id/bans`, DELETE `/communities/:id/bans/:userId` | Community admin: ban list / lift ban (banned users cannot join, also not by code) |
| POST `/communities/:id/reports`, GET `…/reports?status=open|closed`, POST `…/reports/resolve` | Member reports (one per person and item, 20/h); moderation queue grouped by item; resolve `hide|dismiss` |
| GET `/forum/subs`, `/forum/threads`, `/forum/threads/:id` | Public reads |
| POST `/forum/threads`, `/:id/comments`, `/:id/vote` | Authenticated writes; reply parent belongs to same thread |
| GET `/chat`, GET/POST `/chat/:id/messages` | Authenticated conversation member; outsider receives 404. List carries `unread`, partner name/avatar, `online` (B-59) |
| POST `/chat` `{userId}` | Start or open the direct chat with a person (idempotent, one per pair); 201 created / 200 existing |
| GET `/chat/users?q=`, GET `/chat/unread`, POST `/chat/:id/read`, POST `/chat/:id/typing` | People search (>= 2 chars), unread total, read position, typing (REST variant for SSE) |
| GET `/realtime/stream`, POST `/realtime/command` | SSE event stream (auth like every route) and client→server commands for it (`subscribe`/`unsubscribe` `thread:<uuid>`, `typing`) |
| WS `/realtime/ws` (embedded: `/api/realtime/ws`) | WebSocket: cookie auth, or `ALLOW_HEADER_SESSION=true` and first message `{type:"auth",token}` within 5 s; Origin must match host or `CORS_ORIGINS` |
| GET `/notifications`, POST `/:id/read`, `/read-all` | Authenticated owner |
| GET `/products`, `/products/categories`, `/offers`, `/breeders`, `/strains`, `/hall`, `/wiki` | Catalog reads |
| GET `/me/activity` | Authenticated owner |
| GET/POST `/communities` | Public discovery plus own private memberships / create |
| GET `/communities/:id` | Private non-members receive 404; member list only for members |
| POST `/communities/:id/join` | Public join; membership is idempotent |
| POST `/communities/:id/invites` | Community admin; 24-hour one-use code, stored as SHA-256 hash |
| POST `/communities/join` | Atomic membership + invite consumption; returns full CommunityDetail |
| PATCH `/communities/:id/members/:userId/role` | Community admin; cannot remove the final admin |
| GET `/admin/health`, `/stats`, `/users`, `/content` | Current DB role must be platform_admin |
| PATCH `/admin/users/:id/role` | Current operator; cannot remove the final platform admin |
| DELETE `/admin/threads/:id`, `/admin/posts/:id` | Transactional dependent-row deletion |
| POST `/upload/presign` | Auth; `{ name, contentType, size }`; JPEG/PNG/WebP, declared size <=8 MB |

Uploads return `{ key, url, method, headers, expiresIn }`, **not** an anonymous public URL.
Objects remain private. Actual byte inspection/finalization, read URL authorization, quotas
and deletion/retention are still required before exposing uploads publicly.

## Security Boundaries

- JWT algorithm/issuer/audience/expiry are validated. Existing older tokens must log in again.
- JWT role is not the authorization source. Every authenticated request reloads the DB role.
- Auth failures are 401; downstream database failures stay 5xx instead of being disguised as 401.
- Chat membership and private-community visibility are checked server-side.
- Community operations lock the community row, then the invite/member, in one transaction.
- Single-use invitation codes are high-entropy and never logged or stored in plaintext.
- Admin role changes are serialized and recheck the acting operator inside the transaction.
- Health failures return sanitized hints, not raw database errors or secrets.
- UI feature flags are local preview settings, **not** backend access control.

## Tests And Open Gates

See [../../TESTING.md](../../TESTING.md). CI contains a PostgreSQL integration job; its successful
execution is still to be confirmed. Tests target a disposable database ending in `_test`.

`vitest` is an `apps/api` devDependency. `npm run typecheck` covers `src/`;
`npx tsc -p tsconfig.tools.json` additionally covers `seed.ts`, `drizzle.config.ts` and `tests/`.
Run both — this package has not been compiled in the environment that produced it.

Before deployment: (rate limiting exists since B-51 and is shared across instances via the `rate_limits` table since B-60; proxy-level limits remain advisable), token/session revocation, production bootstrap, durable audit,
upload verification, pinned images/lockfile, dependency audit and a restore drill are still open.
AI integration, moderation for the global feed/forum and leaving a community remain future work.

Updated by Codex (OpenAI).
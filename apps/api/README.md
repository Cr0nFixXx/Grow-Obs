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

### Optional Demo Seed

Set `SEED_ADMIN_EMAIL` and a unique `SEED_ADMIN_PASSWORD` of at least 12 characters. There is
**no hardcoded admin password**. Then, only on an empty development database:

```sh
docker compose --profile demo run --rm seed
```

The demo seed is transactional, development-only and opt-in. It includes an operator account,
catalog entries and example communities. It is not a production admin-provisioning workflow.

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
| POST `/auth/register`, `/auth/login` | Credentials; role defaults to member; normalized email |
| GET `/auth/me` | Current session user including explicit `role` |
| GET/POST `/grows`, GET `/grows/:id`, POST `/grows/:id/logs` | Authenticated owner |
| GET/POST `/social/posts`, POST `/social/posts/:id/like` | Authenticated global feed; community scoping still pending |
| GET `/forum/subs`, `/forum/threads`, `/forum/threads/:id` | Public reads |
| POST `/forum/threads`, `/:id/comments`, `/:id/vote` | Authenticated writes; reply parent belongs to same thread |
| GET `/chat`, GET/POST `/chat/:id/messages` | Authenticated conversation member; outsider receives 404 |
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

Before deployment: rate limiting, token/session revocation, production bootstrap, durable audit,
upload verification, pinned images/lockfile, dependency audit and a restore drill are still open.
Presence, real unread positions, community feed isolation, moderation queue and AI remain future work.

Updated by Codex (OpenAI).
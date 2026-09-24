# Grow|Observer API

Selbst hostbares REST-Backend (Hono + Drizzle + PostgreSQL + MinIO). Der REST-Vertrag
passt exakt zum Frontend-Service-Layer (`apps/..` → `src/services/api.ts`).

## Stack

| Baustein | Wahl |
|---|---|
| HTTP-Frame | [Hono](https://hono.dev) + `@hono/node-server` |
| DB | PostgreSQL (16) |
| ORM | Drizzle ORM |
| Auth | JWT (HS256, `jose`) + Argon2-Passwort-Hash |
| Storage | MinIO (S3-kompatibel), Presigned Uploads |
| Validierung | Zod |

## Schnellstart (Docker)

```bash
cd apps/api
cp .env.example .env        # JWT_SECRET anpassen!
docker compose up --build
```

Das start PostgreSQL, MinIO und die API. Der API-Container generiert + führt Migrationen
aus, seedet den Bucket + Demo-Daten und startet den Dev-Server auf `http://localhost:8787`.

- Health: `GET http://localhost:8787/health`
- MinIO-Console: `http://localhost:9001` (minio / minioadmin)

## Schnellstart (lokal, ohne Docker)

```bash
cd apps/api
npm install
cp .env.example .env        # DATABASE_URL + JWT_SECRET anpassen
npm run db:generate         # SQL-Migrationen aus dem Schema erzeugen
npm run db:migrate          # Migrationen ausführen
npm run db:seed             # Bucket + Admin + Katalog + Demo-Daten
npm run dev                 # Dev-Server (Hot-Reload)
```

Admin-Login (Seed-Default): `admin@growobserver.app` / `admin123`

## Endpunkte (Auszug)

| Methode | Pfad | Auth | Beschreibung |
|---|---|---|---|
| POST | `/auth/register` | – | Konto anlegen → `{ token, user }` |
| POST | `/auth/login` | – | Login → `{ token, user }` |
| GET | `/auth/me` | Bearer | Aktuellen User |
| GET/POST | `/grows` | Bearer | Eigene Grows |
| GET | `/grows/:id` | Bearer | Grow (Ownership-Check) |
| POST | `/grows/:id/logs` | Bearer | Log anlegen |
| GET/POST | `/social/posts` | Bearer | Feed |
| POST | `/social/posts/:id/like` | Bearer | Like toggle |
| GET | `/forum/subs`, `/forum/threads` | – | Bereiche / Threads |
| POST | `/forum/threads`, `/forum/threads/:id/comments` | Bearer | Thread / Kommentar |
| POST | `/forum/threads/:id/vote` | Bearer | Up/Downvote |
| GET | `/chat`, `/chat/:id/messages` | Bearer | Konversationen / Verlauf |
| POST | `/chat/:id/messages` | Bearer | Nachricht senden |
| GET | `/notifications` | Bearer | Liste |
| POST | `/notifications/:id/read`, `/notifications/read-all` | Bearer | Gelesen |
| GET | `/products`, `/products/categories`, `/offers` | – | Katalog |
| GET | `/breeders`, `/strains`, `/hall`, `/wiki` | – | Katalog |
| GET | `/me/activity` | Bearer | Abgeleitete Aktivität |
| GET/POST | `/communities` | Bearer | Communities listen/erstellen |
| GET | `/communities/:id` | Bearer | Detail + Mitglieder (private nur als Mitglied) |
| POST | `/communities/:id/join` | Bearer | Öffentlicher Beitritt |
| POST | `/communities/:id/invites`, `/communities/join` | Bearer | Einmal-Code erstellen/einlösen |
| PATCH | `/communities/:id/members/:userId/role` | Bearer + Community-Admin | Rolle ändern |
| GET | `/admin/health` | Bearer + platform_admin | API/DB/Storage/KI-Health |
| GET | `/admin/stats` | Bearer + platform_admin | System-Kennzahlen |
| GET | `/admin/users?q=` | Bearer + platform_admin | User-Suche + Grow-Counts |
| PATCH | `/admin/users/:id/role` | Bearer + platform_admin | Rolle ändern |
| GET | `/admin/content` | Bearer + platform_admin | Aktuelle Threads/Posts |
| DELETE | `/admin/threads/:id`, `/admin/posts/:id` | Bearer + platform_admin | Moderation/Löschung |
| POST | `/upload/presign` | – | Presigned-URL für Upload |

## Schema & Migrationen

- Schema: `src/db/schema.ts` (Drizzle, PostgreSQL)
- Migrationen generieren: `npm run db:generate` (legt `./drizzle` an)
- Ausführen: `npm run db:migrate` (liest `./drizzle`)
- Nach Schema-Änderung: erneut `db:generate` + `db:migrate`

## Struktur

```
apps/api/
  package.json, tsconfig.json, drizzle.config.ts
  Dockerfile, docker-compose.yml, .env.example
  seed.ts
  src/
    index.ts            # App + Route-Mount + CORS + Error-Handler
    env.ts              # Validierte Umgebungsvariablen (Zod)
    db/
      client.ts         # Drizzle + Postgres-Client
      schema.ts         # Tabellen + Relations
      migrate.ts        # Migrations-Lauf
    lib/
      jwt.ts            # Sign/Verify (jose)
      password.ts       # Argon2
      s3.ts             # MinIO/Presign
      time.ts           # relative Zeit (ago)
    middleware/
      auth.ts           # requireAuth, requirePlatformAdmin
    routes/
      auth.ts, grows.ts, forum.ts, social.ts, chat.ts,
      notifications.ts, catalog.ts
```

## Sicherheit

- Passwörter mit **Argon2id** gehasht.
- JWT (HS256) als Bearer-Token; TTL via `JWT_TTL`.
- Ownership-Checks auf User-Ressourcen (Grows, Notifications).
- Presigned Uploads (Client lädt direkt zu MinIO, kein Upload über die API).
- **Nicht vergessen:** `JWT_SECRET` in Production stark & zufällig setzen.

## Hinweise / Ausbaustufen

- `POST /upload/presign` ist aktuell ohne Auth (Fundament) — in Production per Bearer schützen.
- Presence (Online-Status) und Read-Positionen im Chat sind noch nicht modelliert.
- `followers` ist konstant 0 (keine Follows-Tabelle) — folgt mit Communities.
- Realtime (WebSockets/SSE) ist noch nicht angebunden — Polling oder später SSE.

---

> Teil des Grow|Observer-Monorepos. gepflegt von `claude-grow-dev`.

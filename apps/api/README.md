# Grow|Observer API

Selbst hostbare API mit Hono, PostgreSQL und Drizzle; MinIO/S3 ist optional. Sie läuft **eingebettet** in Next.js unter `/api` (Standard) oder als eigener Dienst (`node dist/index.js`, Docker).
Dieses Paket hat eigene Laufzeit, eigenen Typecheck und eigene Tests. Das ist kein Nachweis für Produktionsreife: Der Docker-Stack wurde noch nie ausgeführt
(Teststand: [`../../docs/TESTING.md`](../../docs/TESTING.md), Architektur: [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md)).

## Voraussetzungen

- Node 22 für lokale Werkzeuge und die kompilierte Laufzeit.
- PostgreSQL 16 oder neuer (getestet mit 17) und ein S3-kompatibler privater Bucket (nur für den Standalone-Betrieb nötig).
- Docker Compose für den mitgelieferten lokalen Stack.
- Vor einer Internet-Freigabe: TLS-Reverse-Proxy, echte Secrets, Backups und geprüfte Images.

## Betriebsarten

### Eingebettet (Next.js, Standard)

Dieselbe App wird vom Root-Projekt unter `/api/*` ausgeliefert (`app/api/[...route]` → `src/server/embedded-api.ts`). Migrationen laufen beim ersten Request. Objektspeicher ist optional
(`API_EMBEDDED=true` → Presign antwortet `503`; Bilder liegen in PostgreSQL). Eine **leere** eingebettete Datenbank lässt sich aus `apps/api` mit Demo-Daten befüllen:

```bash
export $(grep -v '^#' ../../.env | xargs) $(grep -v '^#' ../../.env.local | xargs)
API_EMBEDDED=true NODE_ENV=development ALLOW_DEMO_SEED=true \
SEED_ADMIN_EMAIL=admin@example.local SEED_ADMIN_PASSWORD='<mind. 12 Zeichen>' npx tsx seed.ts
```

Relative Imports enden auf `.ts`; `rewriteRelativeImportExtensions` erzeugt daraus `.js` in `dist/`.

### Docker (Standalone)

```sh
cd apps/api
cp .env.example .env
# Getrennte Secrets erzeugen, z. B. openssl rand -hex 32; JWT_SECRET, POSTGRES_PASSWORD und S3_SECRET_KEY in .env eintragen.
docker compose up --build
```

Der Stack bindet Ports standardmäßig an `127.0.0.1`:

| Komponente | Lokaler Endpunkt |
| --- | --- |
| API | http://localhost:8787 |
| API-Liveness (nur Lebenszeichen) | http://localhost:8787/health |
| MinIO S3-API | http://localhost:9000 |
| MinIO-Verwaltung | http://localhost:9001 |
| PostgreSQL | localhost:5432 |

Compose setzt die Hostnamen für Datenbank und Speicher im Container auf `db` und `minio`. Der Browser muss `S3_PUBLIC_ENDPOINT` verwenden, nicht `http://minio:9000`; Presign-URLs
werden für genau diesen Endpunkt signiert und dürfen danach nicht umgeschrieben werden.

Startreihenfolge: gesunde PostgreSQL → eingecheckte Migrationen; gesundes MinIO → privater Bucket; die API startet erst, wenn beide Einmal-Jobs erfolgreich waren. Sie läuft als kompiliertes JS
unter einem Nicht-Root-Nutzer und erzeugt weder Migrationen noch Demo-Daten. Compose-Dienste: `db`, `minio`, `migrate`, `storage-init`, `api`, `admin` (Profil `tools`), `seed` (Profil `demo`).

### Lokal mit Node

```sh
cd apps/api
npm install
cp .env.example .env     # DATABASE_URL, echte Secrets und Speichereinstellungen setzen
npm run typecheck
npx tsc -p tsconfig.tools.json
npm run db:migrate
npx tsx src/db/storage-init.ts
npm run dev
```

`npm run build` erzeugt `dist/index.js` (Node-kompatible `.js`-Imports), `npm start` startet es. `.env` wird mit Node 22 geladen; Docker injiziert Variablen direkt. In Produktion müssen Browser-Origins
und Upload-Endpunkte HTTPS nutzen.
**Achtung:** Nach `npm install`/`npm ci` in `apps/api` bricht das Root-Frontend (Typecheck/Build) wegen einer zweiten `drizzle-orm`-Kopie: danach `rm -rf apps/api/node_modules apps/api/dist`.

## Umgebungsvariablen

Schema und Regeln: `src/config/environment.ts`. Vorlage: `.env.example`.

| Variable | Zweck |
| --- | --- |
| `DATABASE_URL` | PostgreSQL-Verbindung (Pflicht) |
| `JWT_SECRET` | mindestens 32 Zeichen, Pflicht in Produktion; `JWT_TTL` (`30d`, Format `\d+[smhd]`) ist die maximale Sitzungsdauer |
| `CORS_ORIGINS` | kommagetrennte Browser-Origins; in Produktion nur HTTPS |
| `COOKIE_SAMESITE` | `lax` (Standard) oder `none` (nur iframe-Einbettung; erzwingt `Secure` + `Partitioned`) |
| `ALLOW_HEADER_SESSION` | `true` nur für Proxys, die Cookie/Authorization verschlucken (Sandbox-Vorschau); **nie in Produktion** |
| `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET` | Objektspeicher (Standalone Pflicht, eingebettet optional) |
| `API_EMBEDDED` | `true` im eingebetteten Betrieb: S3 optional, CORS-HTTPS-Regel entfällt |
| `TRUST_PROXY`, `RATE_LIMIT_DISABLED` | Rate-Limit: `TRUST_PROXY=false` ignoriert `X-Forwarded-For`; `RATE_LIMIT_DISABLED=true` schaltet ab (nur E2E) |
| `ALLOW_EPHEMERAL_JWT_SECRET` | nur eingebettet: erlaubt ein Prozess-Secret in Produktion (Demos) |
| `ALLOW_DEMO_SEED`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Demo-Seed (siehe unten) |
| `POSTGRES_PASSWORD`, `MINIO_IMAGE` | nur Compose; `MINIO_IMAGE` steht auf `latest` und gehört vor einem Deployment auf einen geprüften Digest gepinnt |

## Betreiber und Demo-Daten

### Ersten Betreiber anlegen (`platform_admin`)

Nie automatisch und ohne Demo-Daten:

```sh
# Docker (nach den Migrationen)
docker compose --profile tools run --rm admin --email betreiber@example.org [--name "Name"]
# Lokal/eingebettet (in apps/api; braucht dieselbe Umgebung wie die API, API_EMBEDDED=true vermeidet S3-Pflichtangaben)
npm run admin:create -- --email betreiber@example.org
# Bestehendes Konto befördern (ausdrücklich; beendet alle seine Sitzungen, Passwort bleibt)
npm run admin:create -- --email mitglied@example.org --promote
# Ausgesperrter Betreiber: neues Einmalpasswort, Wechsel wieder erzwungen, alle Sitzungen beendet
npm run admin:create -- --email betreiber@example.org --reset-password
```

Ein neues Konto bekommt ein zufälliges Einmalpasswort (24 Zeichen), das **einmal** ausgegeben wird; eine `--password`-Option gibt es nicht (Shell-Historie). **Der erste Login erzwingt einen Passwortwechsel**
(`users.must_change_password`; bis dahin antwortet die API auf alles außer `/auth/me`, `/auth/password` und `/auth/logout-all` mit `403 password_change_required`). Der Befehl ist idempotent und schreibt
ein Ereignis `role_changed` (Gerät „Betreiber-CLI“) ins Anmeldeprotokoll. Ohne Root-`tsx` läuft die CLI aus dem Build als `node dist/cli/admin-create.js`.

### Optionaler Demo-Seed

`SEED_ADMIN_EMAIL` und ein eigenes `SEED_ADMIN_PASSWORD` (mindestens 12 Zeichen) setzen – es gibt **kein** hartcodiertes Admin-Passwort. Dann, nur auf einer leeren Entwicklungsdatenbank:

```sh
docker compose --profile demo run --rm seed
```

Der Seed ist transaktional, nur für die Entwicklung und ausdrücklich opt-in. Er legt ein Betreiberkonto, Katalogeinträge und Beispiel-Communities an und ist kein Weg für die Produktion.

## Datenbank-Änderungen

- `src/db/schema.ts` ist das ORM-Schema. Die Migrationen `drizzle/0000` bis `0012` sind **handgeschriebenes SQL** mit eingechecktem Journal (Übersicht: [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) §9).
- `0000_initial.sql` gilt nur für eine **leere** Datenbank. Nie über Tabellen spielen, die frühere, unversionierte `drizzle-kit push`-Läufe angelegt haben; bestehende Installationen vorher sichern und baselinen.
- Neue Migrationen werden geprüft, eingecheckt und bewusst ausgerollt, nie beim Start erzeugt.
- Es gibt **keinen** Drizzle-Snapshot. `db:generate` nicht blind ausführen (doppelte `CREATE`-Statements); entweder zuerst in einer Wegwerf-Datenbank einen passenden Snapshot herstellen oder bei geprüftem handgeschriebenem SQL bleiben.

## Realtime

Chat, „schreibt …“, Online-Status, Benachrichtigungen und Forum-Kommentare laufen über **WebSocket** (Rückfall **SSE**, dann Client-Polling) über PostgreSQL `LISTEN/NOTIFY` – mehrere API-Instanzen brauchen kein
Redis. Pro Konto höchstens 5 Verbindungen; Sitzungen werden alle 25 s neu geprüft (Abmeldung, „Alle Geräte“ und Passwortwechsel schließen live, Code 4401). Architektur: [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) §4.

- Eingebettet braucht den WebSocket-Upgrade `scripts/server.mjs` (`npm start`); mit reinem `next start`/Serverless nutzt der Client SSE. Die Standalone-API (`node dist/index.js`) hängt den WebSocket selbst an.
- **Reverse-Proxy:** `Upgrade`/`Connection` für `/realtime/ws` weiterreichen; für `/realtime/stream` Pufferung ausschalten und ein langes Read-Timeout (≥ 60 s) setzen.
  nginx: `proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_buffering off;`.
- Ein Load Balancer vor mehreren Instanzen braucht keine Stickiness: SSE-Abos laufen ebenfalls über NOTIFY.
- Rauchtest: `PREFIX="" node ../../.archive/diag/realtime-smoke.mjs http://127.0.0.1:4000 ws|sse` (lokales, nicht eingechecktes Skript; eingebettet `PREFIX` weglassen).

## API-Vertrag

Alle Antworten tragen `Cache-Control: private, no-store`. Die Anmeldung läuft über das HttpOnly-Cookie `go_session`; „Auth“ meint eine gültige Sitzung (Auth-Fehler = 401). Unsichere Methoden durchlaufen den CSRF-Schutz.
Ist ein Feature global deaktiviert, antworten seine Pfade mit `403 { error, feature }`. Der Endpunkt-Vertrag steht **nur hier**.

### Allgemein, Konto und Sitzungen

| Methode / Pfad | Zugriff / Verhalten |
| --- | --- |
| GET `/health` | nur Liveness; sagt nichts über Datenbank/Speicher (das tut `/admin/health`) |
| GET `/version` | öffentlich: Backend-Version + Build-Nummer (aus der Root-`version.json` generiert) |
| POST `/auth/register`, `/auth/login` | Zugangsdaten; Rolle standardmäßig `member`; normalisierte E-Mail; Limit Registrierung 10/h je IP, Login 10/15 min je IP und E-Mail |
| GET `/auth/me` | aktuelle Sitzung inkl. expliziter `role` und Pflichtwechsel-Flag (auch bei Pflichtwechsel erlaubt); `PATCH /auth/me`: `{ name?, title?, avatar? }`, Rolle nicht änderbar |
| POST `/auth/logout`, `/auth/logout-all` | Sitzung beenden / alle Geräte abmelden (`logout-all` auch bei Pflichtwechsel) |
| GET `/auth/sessions`, DELETE `/auth/sessions/:id` | eigene Geräteliste (höchstens 5) / einzelne Sitzung beenden |
| POST `/auth/password` | aktuelles Passwort Pflicht (falsch = 403), beendet alle anderen Sitzungen, 5 Versuche/15 min je Nutzer; entsperrt den Pflichtwechsel |
| GET `/auth/login-history` | eigenes Anmeldeprotokoll (höchstens 50, ohne IP, 90 Tage) |
| POST `/upload/presign` | Auth; `{ name, contentType, size }`; JPEG/PNG/WebP, deklarierte Größe ≤ 8 MB; 30 pro 10 min je Nutzer |

Uploads liefern `{ key, url, method, headers, expiresIn }`, **keine** anonyme öffentliche URL; Objekte bleiben privat. Echte Byte-Prüfung/Finalisierung, Leserechte, Quoten und Löschung/Aufbewahrung
für S3 sind noch offen. Bilder über `/media` (unten) liegen dagegen in PostgreSQL mit Magic-Byte-Prüfung.

### Inhalte

| Methode / Pfad | Zugriff / Verhalten |
| --- | --- |
| GET/POST `/grows`, GET `/grows/:id`, POST `/grows/:id/photos`, POST `/grows/:id/logs` | Auth, nur eigene; erstes Foto = Cover |
| GET/POST `/tasks`, POST `/tasks/:id/toggle` | Auth, strikt je Nutzer (fremde IDs → 404) |
| GET/POST `/social/posts`, POST `/social/posts/:id/like`, GET/POST `/social/posts/:id/comments` | Auth. Globaler Feed = Beiträge ohne Community; `?communityId=` bzw. Body-`communityId`: Community-Feed nur für Mitglieder |
| GET `/forum/subs`, `/forum/threads`, `/forum/threads/:id` | öffentlich lesbar (`myVote` für Angemeldete) |
| POST `/forum/threads`, `/forum/threads/:id/comments`, `/forum/threads/:id/vote`, `/forum/comments/:id/vote` | Auth; Antwort-Eltern gehören zum selben Thread; Vote `delta` 1/-1/0 → `{ votes, myVote }` |
| GET `/products`, `/products/categories`, `/offers`, `/breeders`, `/breeders/:id`, `/strains`, `/hall`, `/wiki`, `/wiki/categories`, `/wiki/:id` | öffentliche Katalog-Lesezugriffe |
| POST `/strains`, POST `/wiki` | Auth; Community-Sorte (`tag: "Community"`) / Wiki-Entwurf |
| GET `/strains/collection`, POST `/strains/:id/collect` | Auth; eigene Sammlung / Sammeln umschalten → `{ collected }` |
| GET `/hall/:id/comments`, POST `/hall/:id/comments` | Lesen öffentlich, Schreiben Auth |
| GET `/me/activity` | Auth, eigene Aktivität |
| POST `/media` | Auth; roher Body, JPEG/PNG/WebP (Format per Magic Bytes), ≤ 2 MB, Quote 200 Bilder/100 MB je Nutzer → `{ path: "/media/<id>" }` |
| GET `/media/:id`, DELETE `/media/:id` | Bild ausliefern (öffentlich über nicht erratbare UUID) / löschen (nur Eigentümer) |
| GET `/notifications`, POST `/notifications/:id/read`, POST `/notifications/read-all` | Auth, nur eigene |

### Chat und Echtzeit

| Methode / Pfad | Zugriff / Verhalten |
| --- | --- |
| GET `/chat` | Auth; eigene Unterhaltungen mit `unread`, Partnername/Avatar, `online` |
| POST `/chat` `{userId}` | Direktchat starten oder öffnen (idempotent, einer je Paar); 201 neu / 200 vorhanden; 30 pro 10 min |
| GET `/chat/users?q=` | Personensuche (≥ 2 Zeichen), 60/min |
| GET `/chat/unread`, POST `/chat/:id/read`, POST `/chat/:id/typing` | Summe ungelesen, Leseposition, Tippen (REST-Variante für SSE) |
| GET/POST `/chat/:id/messages` | nur Mitglieder (Außenstehende erhalten 404); Text oder Bild; Senden 90/min |
| GET `/realtime/stream`, POST `/realtime/command` | SSE-Ereignisstrom (60/min) und Client→Server-Befehle (`subscribe`/`unsubscribe` `thread:<uuid>`, `typing`; 240/min) |
| WS `/realtime/ws` (eingebettet: `/api/realtime/ws`) | WebSocket: Cookie-Auth oder (mit `ALLOW_HEADER_SESSION=true`) erste Nachricht `{type:"auth",token}` binnen 5 s; Origin muss zum Host oder zu `CORS_ORIGINS` passen |

### Communities und Moderation

Alle Pfade unter `/communities` verlangen Auth.

| Methode / Pfad | Zugriff / Verhalten |
| --- | --- |
| GET/POST `/communities` | öffentliche Suche plus eigene private Mitgliedschaften / anlegen |
| GET `/communities/:id` | private Nicht-Mitglieder erhalten 404; Mitgliederliste nur für Mitglieder |
| POST `/communities/:id/join` | öffentlicher Beitritt, idempotent; Gesperrte abgewiesen |
| POST `/communities/:id/invites` | Community-Admin; 24-Stunden-Einmalcode, als SHA-256-Hash gespeichert |
| POST `/communities/join` | atomarer Beitritt + Einlösen des Codes; liefert `CommunityDetail`; Gesperrte auch per Code abgewiesen |
| PATCH `/communities/:id/members/:userId/role` | nur Community-Admin; der letzte Admin kann nicht entfernt werden |
| DELETE `/communities/:id/members/:userId` (`?ban=true`) | Moderator (nur Mitglieder) / Admin (auch Moderatoren); nie Admins oder man selbst; optional dauerhafte Sperre |
| GET `/communities/:id/bans`, DELETE `/communities/:id/bans/:userId` | Community-Admin: Sperrliste / Sperre aufheben |
| POST `/communities/:id/(posts/:postId\|comments/:commentId)/(hide\|unhide)` | Moderator/Admin; Moderatoren dürfen keine Admin-Inhalte ausblenden; Ausgeblendetes sieht nur die Moderation |
| POST `/communities/:id/reports` | Mitglied meldet Beitrag/Kommentar; eine Meldung je Person und Inhalt; 20/h |
| GET `/communities/:id/reports?status=open\|closed`, POST `/communities/:id/reports/resolve` | Moderation: Warteschlange nach Inhalt gruppiert (höchstens 100) / Entscheidung `hide` oder `dismiss` |

### Betreiber, Feature-Flags, Updates

| Methode / Pfad | Zugriff / Verhalten |
| --- | --- |
| GET `/admin/health`, `/admin/stats`, `/admin/users`, `/admin/content` | die aktuelle DB-Rolle muss `platform_admin` sein; `/admin/health` prüft Datenbank/Speicher |
| PATCH `/admin/users/:id/role` | Betreiber; der letzte Plattform-Admin bleibt erhalten |
| DELETE `/admin/threads/:id`, `/admin/posts/:id` | transaktionales Löschen inklusive abhängiger Zeilen |
| GET `/features` | öffentlich: `{ overrides }` (fehlender Key = an) |
| PUT `/admin/features/:key`, DELETE `/admin/features` | Betreiber: Override setzen (`{ enabled }`, Kern-Feature → 409) / alle löschen |
| GET `/releases`, POST `/admin/releases`, DELETE `/admin/releases/:id` | Release-Notes: öffentlich (neueste 20) / Betreiber veröffentlichen und löschen |

Im eingebetteten Betrieb kommt `GET /api/version` (`{ version, build, … }` für Update-Erkennung und Anzeige) als eigene Next-Route hinzu.

## Sicherheitsgrenzen

- JWT: Algorithmus, Issuer, Audience und Ablauf werden geprüft, `sub` und `sid` sind Pflicht; ältere Token (vor B-54) sind ungültig. Das Token liegt nur im HttpOnly-Cookie.
- Jede authentifizierte Anfrage prüft die Zeile in `sessions` und lädt die Rolle aus der Datenbank; die JWT-Rolle ist keine Autorisierungsquelle. Abmeldung, „Alle Geräte“ und Passwortwechsel wirken sofort.
- Auth-Fehler sind 401; Datenbankfehler bleiben 5xx und werden nicht als 401 getarnt.
- Chat-Mitgliedschaft und Sichtbarkeit privater Communities werden serverseitig geprüft; Community-Beiträge sind nur Mitgliedern sichtbar (Moderation siehe Architektur §5).
- Community-Operationen sperren die Community-Zeile und danach Einladung/Mitglied in einer Transaktion; Einmal-Einladungen sind hochentropisch und weder geloggt noch im Klartext gespeichert.
- Rollenänderungen der Betreiber werden serialisiert und prüfen den ausführenden Betreiber in der Transaktion erneut.
- Health-Fehler liefern bereinigte Hinweise, keine rohen Datenbankfehler oder Secrets.
- Feature-Flags sperren Routen serverseitig (403), sind aber eine Verfügbarkeitsschaltung, keine Rechteprüfung.

## Tests und offene Punkte

Teststand, Befehle und Release-Gates: [`../../docs/TESTING.md`](../../docs/TESTING.md). Tests laufen gegen eine Wegwerf-Datenbank mit Namen auf `_test` und löschen dort Daten.
`npm run typecheck` deckt `src/` ab, `npx tsc -p tsconfig.tools.json` zusätzlich `seed.ts`, `drizzle.config.ts` und `tests/` – beide ausführen.

Vor einem Deployment offen: Docker-/MinIO-Lauf, Upload-Prüfung für S3 (Finalisierung, Leserechte, Quoten, Löschung), revisionssichere Audit-Aufzeichnung, gepinnte Images, Abhängigkeits-Audit und ein Restore-Test.
Rate-Limits gelten über alle Instanzen (Tabelle `rate_limits`); Limits auf Proxy-Ebene bleiben empfehlenswert. KI-Anbindung, Moderation für den globalen Feed und das Forum sowie „Community verlassen“ sind Zukunftsarbeit.

# Grow|Obs API

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
| `UPLOAD_MAX_MB`, `MEDIA_QUOTA_MB` | Größtes Upload-Objekt (Bild oder Datei) und Speicherkontingent je Nutzer in MB. Standard: auf Vercel 4 (hart max. 4,4, Plattformgrenze) bzw. 100, sonst 50 bzw. 1000. `GET /media/config` meldet die Grenzen der Oberfläche |
| `MEDIA_STORAGE` | `database` (Standard) oder `s3`: wo `POST /media` die Bilder ablegt. `s3` braucht `S3_*`; `GET /media/:id` leitet dann auf einen signierten Link (1 h) um, der Bucket bleibt privat. Zugangsdaten allein schalten nie um |
| `API_EMBEDDED` | `true` im eingebetteten Betrieb: S3 optional, CORS-HTTPS-Regel entfällt |
| `TRUST_PROXY`, `RATE_LIMIT_DISABLED` | Rate-Limit: `TRUST_PROXY=false` ignoriert `X-Forwarded-For`; `RATE_LIMIT_DISABLED=true` schaltet ab (nur E2E) |
| `GET /cron/grow-reminders` | Cron (Bearer `CRON_SECRET`, sonst 404, B-88): erinnert Konten mit eingeschalteter Erinnerung (1–5 Tage) einmal je Lücke an fehlende Messwerte/Logs; eine gebündelte In-App-Meldung, kein Push |
| `GET /cron/media-cleanup` | Cron (Bearer `CRON_SECRET`, sonst 404): löscht ungenutzte Bilder älter als 24 h aus Datenbank und Bucket |
| `DB_POOL_MAX` | Obergrenze der Datenbankverbindungen je Instanz (Standard 10, 1–50). Auf Serverless/gepoolten Anbietern (Vercel + Supabase/Neon) klein setzen: bei Supabase Session-Pooler (Pool ca. 15) `1`, sonst z. B. `3` |
| `SKIP_MIGRATIONS` | `true` überspringt die Migrationen beim Start der eingebetteten API (spart Zeit und Verbindungen bei jedem Kaltstart). Erst setzen, wenn das Schema aktuell ist; nach einem Update mit neuer Migration wieder entfernen und einmal starten |
| `CRON_SECRET` | optional (≥ 16 Zeichen): schaltet `GET /api/cron/weekly-report` frei (Wochenreport, B-71); Aufruf mit `Authorization: Bearer <Wert>`. Ohne Wert antwortet der Endpunkt mit 404. Vercel Cron sendet den Header selbst, wenn die Variable im Projekt gesetzt ist; andere Umgebungen rufen den Endpunkt per externem Cron auf (z. B. sonntags 17:00 UTC). Mehrfaches Aufrufen sendet je Konto höchstens einen Report je ISO-Woche (Europe/Berlin). |
| `ALLOW_EPHEMERAL_JWT_SECRET` | nur eingebettet: erlaubt ein Prozess-Secret in Produktion (Demos) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web-Push (B-63), optional: alle drei oder keiner (`mailto:…` oder `https://…`). Schlüsselpaar erzeugen: `npm run push:keys` (gibt nur aus). Ohne Werte ist Push aus |
| `SMTP_HOST`, `SMTP_FROM`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | E-Mail-Versand (B-87) über einen beliebigen SMTP-Server; `SMTP_HOST` und `SMTP_FROM` zusammen (`SMTP_USER`/`SMTP_PASS` ebenfalls nur zusammen), Port 587 mit STARTTLS (Standard) oder 465 mit TLS. **Mit Versand ist die E-Mail-Bestätigung Pflicht** (unbestätigte Konten sehen nur die Bestätigungsseite) und der Passwort-Reset per Link verfügbar; ohne Versand läuft alles wie bisher (kein Reset per Link, antwortet 503). Beim Einschalten gelten Konten, die zwischen Migration 0023 und dem Einschalten ohne Mail entstanden sind, als unbestätigt (Betreiber kann sie unter Dev-Admin → Benutzer bestätigen). |
| `APP_URL` | öffentliche Adresse für Links in E-Mails (mit `https://`, ohne Pfad); ersatzweise `NEXT_PUBLIC_SITE_URL`. Links nehmen nie die Adresse der Anfrage |
| `MAIL_TRANSPORT` | nur Entwicklung/Test (in Produktion ignoriert): `console` schreibt Mails ins Log, `memory` sammelt sie im Speicher |
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

- `src/db/schema.ts` ist das ORM-Schema. Die Migrationen `drizzle/0000` bis `0013` sind **handgeschriebenes SQL** mit eingechecktem Journal (Übersicht: [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) §9).
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
| GET `/auth/me` | aktuelle Sitzung inkl. expliziter `role` und Pflichtwechsel-Flag (auch bei Pflichtwechsel erlaubt); `PATCH /auth/me`: strikt `{ name?, title?, avatar?, weeklyReport?, bio?, location?, growSince?, medium?, interests?, profileVisibility?, handle?, statusEmoji?, statusText?, statusVisibility?, live? }` (Benutzername höchstens alle 30 Tage; `live: { text, image?, visibility } | null` setzt den 24h-Status für 24 Stunden bzw. entfernt ihn, B-97), Rolle nicht änderbar |
| POST `/auth/logout`, `/auth/logout-all` | Sitzung beenden / alle Geräte abmelden (`logout-all` auch bei Pflichtwechsel) |
| GET `/members/:handle` | Auth; Profil eines Mitglieds. Eingeschränkt sichtbare Profile (`restricted: true`) liefern nur Name, Bild, Titel, `relation`, `canFollow`; sonst Profilfelder und echte Zähler |
| POST / DELETE `/members/:handle/follow` | folgen (sofort bei „Alle“, Anfrage bei „Nur Follower“, 403 bei „Niemand“) / entfolgen bzw. Anfrage zurückziehen; 60 je 10 min |
| GET `/members/:handle/grows` · `/grows/:id` | B-92: Grows des Mitglieds, soweit sichtbar (Besitzer: alle; sonst Profil sichtbar **und** `public`, oder `community` bei gemeinsamer Community; privat nie). Detail = voller Grow nur lesend, unsichtbar → 404 |
| GET `/members/:handle/activity` | B-92: bis zu 20 jüngste Forum-Threads, Forum-Kommentare und Wiki-Artikel (ohne ausgeblendete); 403 bei nicht sichtbarem Profil |
| GET `/members/:handle/followers`, `/following` | Listen, nur wenn das Profil sichtbar ist (sonst 403) |
| GET `/follows/requests`, POST `/follows/requests/:userId/accept` bzw. `/decline`, DELETE `/follows/followers/:userId` | eigene offene Anfragen annehmen/ablehnen; Follower entfernen |
| GET `/auth/sessions`, DELETE `/auth/sessions/:id` | eigene Geräteliste (höchstens 5) / einzelne Sitzung beenden |
| POST `/auth/password` | aktuelles Passwort Pflicht (falsch = 403), beendet alle anderen Sitzungen, 5 Versuche/15 min je Nutzer; entsperrt den Pflichtwechsel |
| GET `/auth/account/check` | Auth (B-74); was das Löschen verhindert: `{platformAdmin, communities[], groups[], blocked}` |
| POST `/auth/export` | Auth, Passwort Pflicht (falsch = 403), 3/Stunde je Nutzer; liefert `{path}` mit einem 2 Minuten gültigen Ticket (an Konto und Sitzung gebunden) |
| GET `/auth/export/download?ticket=` | Auth; streamt das ZIP (`daten.json` + `medien/…`), `no-store`; abgelaufen oder fremd = 410 |
| DELETE `/auth/account` | Auth; `{password, confirm:"LÖSCHEN", options:{forum,feed,comments,chat: "delete"\|"keep", media: "remove"\|"keep"}}`; sofort und endgültig, 403 falsches Passwort, 409 `account_blocked` (letzter Plattform-Admin, alleiniger Admin einer Community/Gruppe mit weiteren Mitgliedern), 5 Versuche/15 min; Rest bleibt als Hülle „Gelöschtes Mitglied“ |
| GET `/auth/login-history` | eigenes Anmeldeprotokoll (höchstens 50, ohne IP, 90 Tage) |
| POST `/upload/presign` | Auth; `{ name, contentType, size }`; JPEG/PNG/WebP, deklarierte Größe ≤ 8 MB; 30 pro 10 min je Nutzer |

Uploads liefern `{ key, url, method, headers, expiresIn }`, **keine** anonyme öffentliche URL; Objekte bleiben privat. Echte Byte-Prüfung/Finalisierung, Leserechte, Quoten und Löschung/Aufbewahrung
für S3 sind noch offen. Bilder über `/media` (unten) liegen dagegen in PostgreSQL mit Magic-Byte-Prüfung.

### Inhalte

| Methode / Pfad | Zugriff / Verhalten |
| --- | --- |
| GET/POST `/grows`, GET `/grows/:id`, POST `/grows/:id/photos`, POST `/grows/:id/logs` | Auth, nur eigene (B-101: Logs und Fotos nehmen optional `strainIds`; Sorten tragen eine stabile `id`); erstes Foto = Cover. `POST /grows` (strikt): `name`, `strains` (B-100: 1–20 Sorten `{name, breeder, plants, wetG, dryG, genetics?, light?, seed?}`; B-105: `genetics` `Indica\|Sativa\|Hybrid`, `light` `photo\|fast\|auto`, `seed` `regular\|feminized`, `null` löscht, weggelassen = unverändert bei bekannter `id`; der Typ des Grows folgt der Genetik, hat Vorrang) oder die alten Felder `strain`/`breeder` (eine Sorte), `type` (B-105: optional, sonst aus der Genetik der Sorten abgeleitet, sonst Hybrid), `site` (B-105: `indoor` \| `outdoor` \| `null`), `medium`, `startDate`, `visibility` (B-102: `private` (Standard) \| `public` \| `community`), `totalDays` |
| PATCH `/grows/:id` | Felder ändern (strikt): `name`, `strains` (ersetzt die Sortenliste), `strain` (alt: genau eine Sorte), `breeder`, `type`, `site` (B-105), `medium`, `startDate`, `totalDays`, `expectedYield`, `condition`, `leafOffset` (Blatt-Abzug fürs VPD, 0–6 °C, Standard 2), `targets` (`{ph?: {min,max}|null, ec?: {min,max}|null}` – Zielbereiche für die Diagramme, pH 0–14, EC 0–10, min < max, `null` = Band aus; Standard pH 5,8–6,5, EC 1–2 mS) (`gesund`/`beobachten`/`problem`); Tag und Fortschritt ergeben sich aus dem Startdatum |
| POST `/grows/:id/logs` | `{title, text?, tag?, date?}` (strikt; `date` = JJJJ-MM-TT, Standard heute, nicht vor Start und nicht in der Zukunft; ein altes `day` wird ignoriert, der Tag wird aus dem Datum berechnet). Antwort: Eintrag `{id, day, date, title, text, tag}` |
| PATCH / DELETE `/grows/:id/logs/:logId` | Titel, Text, Kategorie, Datum, `strainIds` (B-101, Sorten-IDs; leer = ganzer Grow; Unbekanntes 400) ändern (leere Anfrage ändert nichts) bzw. löschen (204, idempotent); fremder Grow oder Eintrag → 404 |
| PATCH `/grows/:id/photos/:photoId` | `{caption?: ≤ 200 Zeichen, cover?: true, strainIds?: string[]}`; Antwort: Grow. DELETE: Foto samt Datei löschen (außer anderweitig verwendet), das Titelbild rückt nach; Antwort: Grow, unbekanntes Foto 404 |
| PUT `/grows/:id/env` | `{date?, temp?, rh?, ec?, ph?, strainEnv?: [{strainId, plant?, ph?, ec?}]}` (B-101: `strainEnv` angegeben = ersetzt die Sortenwerte des Tages, weggelassen = unverändert; B-104: `plant` 1…n = einzelne Pflanze der Sorte (nur bei gesetzter Pflanzenzahl, höchstens n; je Sorte/Pflanze ein Eintrag), weggelassen/0 = ganze Sorte; Antwort und `GET /grows/:id` liefern `plant`; sinkt die Pflanzenzahl, entfallen die Werte der nicht mehr vorhandenen Pflanzen; nur Sortenwerte genügen, dann entfällt der Tageswert; Antwort enthält `strainEnv`) – ein Eintrag je Kalendertag, erneutes Speichern **ersetzt** den Tag; Werte optional/`null`, mindestens einer; Bereiche: Temperatur −10…60, Luftfeuchte 0…100, EC 0…10, pH 0…14. Antwort: `{day, date, temp, rh, vpd, ec, ph}`; das VPD wird berechnet (Blatt = Luft − `leafOffset`), nicht gespeichert |
| DELETE `/grows/:id/env/:date` | Messwerte eines Tages löschen; 204, idempotent; ungültiges Datum 400 |
| POST `/grows/:id/phase` | `{phase}` (Keimung, Vegetativ, Blüte, Trocknen, Curing); merkt das Datum des ersten Wechsels; 409 bei beendetem Grow |
| POST `/grows/:id/finish` | `{outcome: "harvested"\|"aborted", date?, wetG?, dryG?, note?, strainWeights?: [{wetG, dryG}] (B-100, je Sorte in Listenreihenfolge, Summen = Gesamtgewicht)}`; erneuter Aufruf trägt Werte nach; Abbruch verwirft Gewichte; Datum nicht vor Start/Zukunft, Trocken ≤ Nass (400) |
| POST `/grows/:id/reopen`, `/archive`, `/unarchive` | Grow wieder aufnehmen bzw. archivieren; idempotent |
| DELETE `/grows/:id` | endgültig samt Einträgen, Messwerten, Fotos und Bilddateien; 204 auch bei wiederholtem Aufruf und fremden Grows (ohne Wirkung) |
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
| POST `/media` (`?kind=file&name=…` für Dokumente), GET `/media/config` | Roher Upload: Bild (JPEG/PNG/WebP) oder – nur mit `kind=file` – Datei der Positivliste (PDF, Office, TXT, CSV, ZIP; Prüfung nach Endung und Inhalt) / Upload-Grenzen |
| GET `/media/:id`, DELETE `/media/:id` | Bild ausliefern (Dateien und `?download=1` immer als Download) – **nur mit Login** (401), Chat-Anhänge nur für Mitglieder der Unterhaltung und den Eigentümer (sonst 404); `?raw=1` liefert ein PDF gestreamt für die Vorschau (sonst 400; `private, no-store`); bei `MEDIA_STORAGE=s3` Weiterleitung auf einen signierten Link (1 h gültig) / löschen (nur Eigentümer, entfernt auch das Objekt) |
| GET `/notifications`, POST `/notifications/:id/read`, POST `/notifications/read-all` | Auth, nur eigene |

### Chat und Echtzeit

| Methode / Pfad | Zugriff / Verhalten |
| --- | --- |
| GET `/chat` | Auth; eigene Unterhaltungen mit `unread`, Partnername/Avatar, `online`; Gruppen zusätzlich `role`, `memberCount` (Vorschau „Anna: Text“, `unread` ohne stumme Themen) |
| POST `/chat` `{userId}` | Direktchat starten oder öffnen (idempotent, einer je Paar); 201 neu / 200 vorhanden; 30 pro 10 min |
| GET `/chat/users?q=` | Personensuche (≥ 2 Zeichen), 60/min |
| GET `/chat/unread`, POST `/chat/:id/read`, POST `/chat/:id/typing` | Summe ungelesen, Leseposition, Tippen (REST-Variante für SSE) |
| GET/POST `/chat/:id/messages` | nur Mitglieder (Außenstehende erhalten 404); Text oder Bild; Senden 90/min. Optional `replyTo` (Nachrichten-ID; gleiche Unterhaltung, nicht gelöscht, keine Systemzeile, in Gruppen gleiches Thema, sonst 400); Nachrichten tragen `senderHandle`, `senderAvatar`, `replyTo` (`{id, from, senderName, text ≤140, hasAttachment, deleted}` oder `null`). Gruppen: `?topicId=` bzw. Body `topicId` (ohne Angabe „Allgemein“); Nachrichten tragen `senderId`, `senderName`, `kind` (`user`/`system`), `topicId` |
| DELETE `/chat/:id/messages/:messageId` | Nachricht für alle löschen (B-82): Absender oder Gruppen-Admin; 204 (auch wiederholt), 400 Systemzeile, 403 fremd ohne Admin, 404 Außenstehende. Text und Anhänge werden geleert, nicht mehr verwendete Medien samt Bucket-Objekt gelöscht; Liste zeigt „🚫 Nachricht gelöscht“; Ereignis `chat.message` mit `deleted: true` |
| POST `/chat/groups` `{name, avatar?, userIds}` | Gruppe anlegen (Name 1–60 Zeichen, mindestens 1 und höchstens 19 Einladungen; Ersteller = Admin, Thema „Allgemein“); 10 pro 10 min. Antwort = Gruppen-Detail plus `skipped` |
| GET `/chat/groups/:id` | Mitglieder (Rolle, online), Themen (`unread`, `muted`, `canWrite`, bei Admins `memberIds` privater Themen), `historyVisible`, `role`; offene Einladungen nur für Admins; Nicht-Mitglieder 404 |
| PATCH `/chat/groups/:id` `{name?, avatar?\|null, historyVisible?}` | nur Admins; Umbenennen schreibt eine Hinweiszeile |
| POST `/chat/groups/:id/invites` `{userIds}` · DELETE `…/invites/:inviteId` | nur Admins; Einladung (7 Tage gültig), In-App-Benachrichtigung + Push (Kategorie `messages`); übersprungen werden Mitglieder, schon Eingeladene und Personen mit 20 offenen Einladungen; **Mitglieder + offene Einladungen ≤ 20** (sonst 409); Zurückziehen 204; 30 pro 10 min |
| GET `/chat/invites` · POST `/chat/invites/:id/accept` · `…/decline` | eigene offene Einladungen; Annehmen in einer Transaktion mit Sperre auf der Gruppe (409 nicht mehr gültig/voll, 410 abgelaufen); fremde Einladungen 404 |
| DELETE `/chat/groups/:id/members/:userId` · POST `/chat/groups/:id/leave` | Entfernen nur Admins (nicht sich selbst); Verlassen jeder; ohne Admin wird das am längsten dabei seiende Mitglied Admin, die letzte Person löscht die Gruppe samt Nachrichten; Hinweiszeilen |
| POST `/chat/groups/:id/topics` `{name, emoji?, private?, adminsOnly?, userIds?}` · PATCH/DELETE `…/topics/:tid` | nur Admins; Name 1–40, Emoji ≤ 8 Zeichen, höchstens 50 Themen; PATCH `name, emoji, adminsOnly, closed, pinned` (`private` ist nach dem Anlegen fest); „Allgemein“ nicht löschbar; Löschen entfernt die Nachrichten des Themas |
| POST `…/topics/:tid/move` `{direction}` · PUT `…/topics/:tid/members` `{userIds}` · PUT `…/topics/:tid/me` `{muted}` | Reihenfolge (innerhalb angehefteter/übriger), Mitglieder privater Themen (nur Gruppenmitglieder; Admins sehen immer alles), eigene Stummschaltung (jedes Mitglied) |
| GET `/realtime/stream`, POST `/realtime/command` | SSE-Ereignisstrom (60/min) und Client→Server-Befehle (`subscribe`/`unsubscribe` `thread:<uuid>`, `typing`; 240/min) |
| WS `/realtime/ws` (eingebettet: `/api/realtime/ws`) | WebSocket: Cookie-Auth oder (mit `ALLOW_HEADER_SESSION=true`) erste Nachricht `{type:"auth",token}` binnen 5 s; Origin muss zum Host oder zu `CORS_ORIGINS` passen |

### Web-Push

Feature-Flag `push` (aus → 403). Alle Pfade verlangen Anmeldung.

| Methode / Pfad | Zugriff / Verhalten |
| --- | --- |
| GET `/push/config` | `{configured, publicKey}` (öffentlicher VAPID-Schlüssel, nie der private) |
| GET `/push` | Einstellungen (`prefs`, Uhrzeiten als `HH:MM`) und Geräte (`devices`: Gerätename, `current`; Endpunkt und Schlüssel werden nicht zurückgegeben) |
| PUT `/push/prefs` | Teiländerung: `messages`, `community`, `grows`, `other`, `showPreview`, `quietEnabled`, `quietStart`, `quietEnd`, `timezone` (IANA); sonst 400 |
| POST `/push/subscribe` | `{endpoint, keys:{p256dh, auth}}`; Endpunkt nur HTTPS bei bekannten Push-Diensten (sonst 400), an die Sitzung gebunden, idempotent, höchstens 5 Geräte (das älteste fällt weg); 503 ohne VAPID; 30 pro 10 min |
| POST `/push/unsubscribe` `{endpoint}`, DELETE `/push/devices/:id` | nur eigene Geräte |
| POST `/push/test` | Test-Meldung an alle eigenen Geräte (ignoriert Kategorien/Ruhezeit); 409 ohne Gerät, 503 ohne VAPID; 6 pro Minute |

Versand (`lib/push.ts`): Konfiguration → Feature → Abos → Kategorie → Ruhezeit → Nutzer online → Drosselung (1 je Gruppe/15 s). Standardtext neutral, mit „Vorschau“ der echte Inhalt.

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
| GET `/communities/:id/reports?status=open\|closed&offset`, POST `/communities/:id/reports/resolve` | Moderation: Warteschlange nach Inhalt gruppiert, `{items, hasMore}` (20 pro Seite, älteste zuerst; B-89) / Entscheidung `hide` oder `dismiss` |

### Betreiber, Feature-Flags, Updates

| Methode / Pfad | Zugriff / Verhalten |
| --- | --- |
| GET `/admin/health`, `/admin/stats`, `/admin/users`, `/admin/content` | die aktuelle DB-Rolle muss `platform_admin` sein; `/admin/health` prüft Datenbank/Speicher |
| PATCH `/admin/users/:id/role` | Betreiber; der letzte Plattform-Admin bleibt erhalten |
| POST `/admin/users/:id/ban` `{reason?}` · POST `…/unban` | Betreiber (B-89); sperrt (Login 403 `account_banned` mit Grund nach richtigem Passwort, Sitzungen beendet) bzw. hebt auf; nie das eigene Konto oder einen Plattform-Admin; protokolliert |
| DELETE `/admin/users/:id` `{password, confirm:"LÖSCHEN", options, reason?}` | Betreiber (B-89); löscht ein fremdes Konto wie `DELETE /auth/account` (dieselben Optionen), Betreiber-Passwort nötig; Antwort `{ok, mode}` |
| GET `/admin/moderation-log?offset` | Betreiber; `{hasMore, items[{id, action, actor, target, targetKind, reason, details, createdAt}]}`, 50 pro Seite |
| POST `/moderation/reports` `{kind, targetId, reason, details}` | jedes angemeldete Mitglied (B-89); `kind` `post\|comment\|thread\|forum_comment`; 20/h; 201, Duplikat `{duplicate:true}`, eigener Inhalt 400, unbekannt oder Community-Inhalt 404 |
| GET `/moderation/reports?status=open\|closed&offset` · POST `…/resolve` `{kind, targetId, action}` · POST `/moderation/hide` `{kind, targetId, hidden}` | Plattform-Rolle Moderator/Admin/Betreiber (B-89); Warteschlange `{items, hasMore}` (20 pro Seite); Rangfolge wie bei Communities |
| POST `/communities/:id/leave` | Mitglied verlässt die Community (B-89); 404 kein Mitglied, 409 letztes Mitglied oder Alleinadmin mit weiteren Mitgliedern; kein Sperrlisten-Eintrag |
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
`npm run typecheck` deckt `src/` ab, `npx tsc -p tsconfig.tools.json` zusätzlich `seed.ts`, `drizzle.config.ts` und die API-Tests in `../../tests/api` – beide ausführen (braucht `npm ci --prefix apps/api`; die Konfiguration bildet `drizzle-orm`, `hono` und `postgres` auf die Kopie in `apps/api/node_modules` ab, damit es nur eine Typ-Version gibt).

Vor einem Deployment offen: Docker-/MinIO-Lauf, Upload-Prüfung für S3 (Finalisierung, Leserechte, Quoten, Löschung), revisionssichere Audit-Aufzeichnung, gepinnte Images, Abhängigkeits-Audit und ein Restore-Test.
Rate-Limits gelten über alle Instanzen (Tabelle `rate_limits`); Limits auf Proxy-Ebene bleiben empfehlenswert. KI-Anbindung, Moderation für den globalen Feed und das Forum sowie „Community verlassen“ sind Zukunftsarbeit.

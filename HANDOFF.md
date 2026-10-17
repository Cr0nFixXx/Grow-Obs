# HANDOFF.md

**Für:** Claude Code, OpenCode, Codex, Hermes und andere Coding-Agents  
**Projekt:** Grow|Observer  
**Stand:** B-54 (Arena Agent). **Next.js 16 ist der primäre Runtime-Build** (SPA-Hülle, eingebettete
API unter `/api`); Vite bleibt als Legacy-Single-File-Build. **Gemessen (Node 22, PostgreSQL 17):**
typecheck ✅ · lint ✅ · 108 Frontend-Tests ✅ · 62 API-Integrationstests ✅ · 19 Browser-E2E-Tests (Playwright) ✅ ·
`next build` ✅ · `build:vite` ✅. Docker-Stack und Touch auf realen Geräten weiterhin ungetestet → TESTING.md.  
**Sprache der UI:** Deutsch  
**Vorheriger Agent:** `claude-grow-dev` (Claude · Anthropic)

**Aktuelle Bearbeitung:** Codex (OpenAI). Die frühere Signatur ist historisch, keine Kennung
dieses Agents. Maßgeblicher Prüfstatus: `TESTING.md` und neuester Eintrag in `PROGRESS.md`.

## B-54: Session-Härtung (Arena Agent)

- **Transport:** Cookie `go_session` (HttpOnly, SameSite=Lax, Secure bei HTTPS). Kein Bearer, kein Token im Body/Storage.
  Der Browser kennt nur den Marker `go-session:api:<url>=1` (`src/lib/session-storage.ts`). Mock-Modus unverändert.
- **Server:** `apps/api/src/lib/session.ts` (`startSession`, `authenticate`, `deviceLabel`), `middleware/auth.ts`
  (`requireAuth`/`optionalAuth` prüfen Cookie → JWT mit `sid` → Zeile in `sessions` → Rolle aus `users`),
  `middleware/csrf.ts` (global, vor den Routen). Routen in `routes/auth.ts`: `/logout`, `/logout-all`, `/sessions`, `/sessions/:id`.
- **Lebensdauer:** `JWT_TTL` (Standard 30d) = absolute Sitzungsdauer; ohne „Angemeldet bleiben“ ≤ 12 h und Session-Cookie.
  `last_seen_at` wird höchstens alle 5 Minuten aktualisiert; abgelaufene Zeilen werden beim nächsten Login gelöscht.
- **Cross-Origin-Betrieb (Standalone-API):** funktioniert nur, wenn Frontend und API **same-site** sind (z. B. `app.` und
  `api.` derselben Domain) und der Frontend-Origin in `CORS_ORIGINS` steht; der Client sendet `credentials: "include"`.
- **UI:** `src/components/SessionsCard.tsx` (Profil → Einstellungen). 401 einer Fach-Anfrage → Event `go:session-expired`
  → lokale Abmeldung (`AuthProvider`).
- **iframe-Einbettung:** `COOKIE_SAMESITE=none` → `Secure; SameSite=None; Partitioned` (nur Vorschau/Einbettung; Standard `lax`).
  `scripts/preview.sh` setzt `none`. Ohne das verwirft der Browser das Cookie im Cross-Site-iframe (Login scheitert still).
- **Migration:** Bestehende Nutzer müssen sich einmal neu anmelden (alte Bearer-Token sind ungültig).
- **Offen:** Passwort-ändern-Endpunkt (soll alle anderen Sitzungen beenden), Anmeldeprotokoll, Gerätelimit,
  mehrinstanzfähiges Rate-Limit.

## B-53: Keine Demo-Daten im API-Modus (Arena Agent)

- **Regel:** `config.useMock` (`src/lib/config.ts`) = Demo-Daten aus `src/mocks/data.ts` erlaubt; sonst echte Daten oder
  `EmptyState`/ehrlicher Hinweis. Neue Views müssen sich daran halten.
- **Betroffen:** Dashboard, Auth, Strains (Bewertungen), Consumption (ganze Seite), Wiki, Social, AIAssistant.
  Unverändert: Calculator, Simulation, Showcase (Referenzinhalt).
- **`Avatar`** (`src/components/ui.tsx`): immer `name` mitgeben → Initialen-Fallback bei fehlendem/kaputtem Bild.
- **Offen (keine Datenquelle im Backend):** Kosten/Verbrauch, KI-Chat, Erdmischungs-Rezepte, Stories, Sorten-Bewertungen.
- Tests: `src/components/ui.test.tsx`, E2E-Block „Keine Demo-Daten im API-Modus“ in `e2e/app.spec.ts`.

## B-52: Zentrale Versionierung + Preview-Skript (Arena Agent)

- **`version.json` (Root)** ist die einzige Quelle: `frontend {codename, version}`, `backend {version}`, `build`, `modules`.
  Stand: Frontend **„Ruderalis“ v0.1.1**, Backend **v0.0.2** (vom Eigner vorgegeben; ersetzt die frühere
  Zählung 0.50.0 / B-xx als Versionsnummer – die B-Nummern bleiben als Build-Protokoll in `PROGRESS.md`).
- **`scripts/version.mjs`** (`npm run version:sync|check|build|show`): synchronisiert `package.json` + Lockfiles und erzeugt
  `apps/api/src/version.generated.ts` (das Backend-Docker-Image sieht nur `apps/api/`, daher kein Root-Import).
  `version:check` läuft in CI und als Vitest (`src/lib/version.test.ts`). Es gibt bewusst **kein** Kommando zum
  Hochzählen von Versionen – die vergibt der Eigner.
- **Build-Nummer** `YYMMDDHH` (Europe/Berlin, DST-sicher getestet) setzt `npm run version:build` **nach jeder abgeschlossenen Aufgabe**.
- **Update-Erkennung unverändert:** weiter über die zufällige Build-ID (`/api/version` → `build`). Neu in der Antwort:
  `codename`, `buildNumber`, `backend.version`. API: `GET /version` (öffentlich, Standalone).
- **Anzeige:** Login-Footer (`data-testid="app-version"`), Einstellungen → Updates (Frontend/Backend/Build), Dev-Admin.
  Mock-Release („Was ist neu“) nutzt jetzt die aktuelle Frontend-Version.
- **Module vorbereitet:** `modules` in `version.json` + `moduleVersion()` (Frontend, Backend); ohne Eintrag Vererbung.
- **Preview:** `npm run preview` (`scripts/preview.sh`): Postgres/DB sicherstellen, bei Bedarf bauen, `next start` auf `0.0.0.0:3000`.
- **Falle:** Wer `npm install --prefix apps/api` im selben Checkout ausführt, bekommt eine zweite `drizzle-orm`-Kopie →
  `next build` bricht in `src/server/embedded-api.ts` mit einem Typfehler ab. Für API-Typechecks danach
  `rm -rf apps/api/node_modules` (CI trennt die Jobs, daher dort unkritisch).

## B-51: Härtung, Browser-E2E, Build-Fix (Arena Agent)

- **Build-Fix:** `src/assets/hero.jpg` fehlte auf Branch `A` (Commit `2a81529` hatte sie gelöscht) → beide
  Builds rot. Wiederhergestellt. **Binärdateien beim Committen prüfen** (`git status`/`git show --stat`).
- **Rate-Limits** (`apps/api/src/middleware/rate-limit.ts`): Login 10/15 min pro IP + pro E-Mail, Register 10/h/IP,
  Upload 30/10 min/Nutzer; `429` + `Retry-After`. Pro Prozess; `TRUST_PROXY=false`, `RATE_LIMIT_DISABLED=true`.
- **JWT-Pflicht:** Embedded-API bricht in Produktion ohne `JWT_SECRET` ab (503); Opt-out
  `ALLOW_EPHEMERAL_JWT_SECRET=true` (`src/server/jwt-secret.ts`).
- **Browser-E2E:** `npm run test:e2e` (Playwright, Produktions-Build, Wegwerf-DB `growobserver_e2e`, Port 3100;
  `npx playwright install chromium` einmalig). Specs in `e2e/` (Konto/Session, Grow, Forum, Deep-Link, Mobile/Pixel 5).
  CI-Job `e2e` in `.github/workflows/ci.yml`. **Nie gegen eine Produktiv-DB richten** (legt Nutzer an).
- **Bug durch E2E gefunden:** Auf Datenbanken ohne Demo-Seed gab es keine Forum-Bereiche (`subs`) → Threads
  erstellen scheiterte mit 404. Migration `0006_default_forum_subs.sql` legt die sechs Standard-Bereiche an
  (idempotent); `seed.ts` nutzt `onConflictDoNothing`.
- **Bekannt, offen (`test.fixme` in `e2e/app.spec.ts`):** Das Dashboard zeigt im API-Modus auch für neue Nutzer
  statische Demo-Zahlen („2 Aktive Grows“, „168 €“, „94 %“, KI-Empfehlung zur VPD) aus `src/mocks/data`.
  Außerdem: Avatar-Fallback zeigt Alt-Text („Avat…“) statt Initialen; Register-Formular nennt die
  12-Zeichen-Mindestlänge nicht vorab.
- **Lockfile:** Root-`package-lock.json` ist eingecheckt. Frühere „`npm ci`“-Hinweise galten nicht für das Repo.

## B-42: Blocker-Fixes + Next.js-Hülle (Claude · Anthropic)

Tatsächlich ausgeführt und grün: `next typegen`, `tsc --noEmit`, `eslint .` (0/0), `vitest run`
(52/52), `next build`, `vite build`, API `typecheck` + `tsconfig.tools.json` + `build`,
API-Integrationstests (13/13, Wegwerf-DB `growobserver_test`), Smoke-Test `next start`.

- **API-Blocker behoben:** `src/db/migrate.ts` nutzte `await` in einem nicht-async Callback
  (Migration/Docker-`migrate` wären gescheitert). `npm install` in `apps/api` brach mit
  npm-Arborist-Fehler `edgesOut` ab → Ursache `vitest` als API-devDependency; entfernt (Tests laufen
  über den Root-Runner). `apps/api/package-lock.json` ist jetzt eingecheckt (`npm ci` in CI).
- **Next.js-Hülle aktiv:** `npm run dev|build|start` = Next. `app/page.tsx` lädt `@/App` per
  `dynamic(ssr:false)` + ErrorBoundary + SW-Registrierung (`src/lib/pwa.ts`). `app/api/health`.
  Alter `next.config.js` (CommonJS in `"type":"module"` → Absturz) durch `next.config.ts` ersetzt.
- **`src/pages/` → `src/views/` umbenannt.** `pages` ist in Next reserviert (Pages Router) und
  kollidiert mit `app/`. Neue Screens gehören nach `src/views/`.
- **Env:** `NEXT_PUBLIC_API_URL` (Next) bzw. `VITE_API_URL` (Vite-Legacy), siehe `src/lib/config.ts`.
- **Bild-Imports:** Vite liefert String, Next `StaticImageData` → immer `assetSrc()` aus
  `src/lib/asset.ts` verwenden.
- **PostCSS:** Root-`postcss.config.mjs` (für Next) existiert jetzt; Vite ignoriert sie über
  inline `css.postcss` in `vite.config.ts`.
- **PWA:** SW-Policy cacht zusätzlich gehashte `/_next/static/*`-Assets (MIME-geprüft); Offline-
  Navigation fällt auf `/` zurück. Cache-Name `go-shell-v4-next` (alte Caches werden entfernt).
- **Lint:** `eslint-plugin-react-hooks` ergänzt (rules-of-hooks, exhaustive-deps); CI-Lint blockiert.
- Root-`.gitignore` ergänzt (vorher fehlte sie komplett).

## B-50: App-Updates – Erkennung, Einstellungen, „Was ist neu“ (Claude · Anthropic)

- **Erkennung:** Jeder Build bekommt eine ID (`next.config.ts` → `generateBuildId` + `NEXT_PUBLIC_APP_BUILD`,
  optional fest per `APP_BUILD_ID`). Client vergleicht mit **`/api/version`** (Next-Route, liest
  `.next/BUILD_ID`) beim Start, bei Sichtbarkeit/Online, alle 5 Min. und bei Pull-to-Refresh.
  App-Version = `version.json` → `frontend.version` (Eigner vergibt; B-52, `package.json` wird per `npm run version:sync` nachgezogen).
- **Nutzer-Einstellung** (Profil → Einstellungen → App-Updates, pro Gerät `go-update-prefs`):
  *Automatisch* (still neu laden beim Start oder wenn die App im Hintergrund ist – nie mitten in einer
  Eingabe), *Nachfragen* (Banner, Standard), *Manuell* (Hinweis im Menü/Einstellungen) +
  „Was ist neu anzeigen“ an/aus, „Nach Updates suchen“, Versionsanzeige.
- **Admin (Developer-Admin → Tab „Updates“):** Release-Notes veröffentlichen (Version, Titel, Punkte,
  Dringlichkeit *Optional/Empfohlen/Pflicht*), neue Features hervorheben und optional **gleichzeitig
  global freischalten**. *Pflicht* blockiert Apps, deren Build älter als das Release ist (Modal).
- **API/Migration `0005_app_releases.sql`:** `GET /releases` (öffentlich, neueste 20),
  `POST /admin/releases`, `DELETE /admin/releases/:id` (Plattform-Admin, Feature-Keys validiert).
- **Logik** rein in `src/lib/update-logic.ts` (getestet), Zustand in `src/lib/update.tsx`
  (`UpdateProvider`/`useAppUpdate`), UI in `src/components/UpdateUI.tsx`. Erststart markiert vorhandene
  Releases als gesehen (keine Altlasten für neue Nutzer).

## B-49: Globale Feature-Flags + echtes Aktualisieren (Claude · Anthropic)

- **Feature-Flags sind jetzt global.** Vorher nur localStorage des Admins („lokale Vorschau“) – andere
  Nutzer/Geräte (auch installierte PWAs) merkten nichts; das war kein PWA-Problem.
  Jetzt: Tabelle `feature_flags` (Migration `0004_feature_flags.sql`), `GET /features` (öffentlich),
  `PUT /admin/features/:key`, `DELETE /admin/features` (nur Plattform-Admin, Kern-Features → 409).
  **Serverseitige Sperre:** Middleware `requireFeature` blockiert Routen deaktivierter Features mit
  `403 { feature }` (Zuordnung Pfad→Feature in `apps/api/src/lib/features.ts`, 5-s-Prozess-Cache).
- **Client (`FeatureProvider`)** lädt Overrides über den neuen `FeatureService` beim Start, bei Fokus/
  Sichtbarkeit, alle 60 s, bei Pull-to-Refresh und sofort nach einem `403 { feature }`. Letzter Stand
  wird gecacht (`go-features-cache`) → App startet offline mit den richtigen Schaltern.
  Demo-/Mock-Modus: weiterhin nur lokal, im Dev-Admin als „Nur dieser Browser (Demo)“ gekennzeichnet.
- **Schlüssel-Parität:** `apps/api/src/lib/feature-keys.ts` ↔ `src/config/features.ts`, geprüft durch
  `src/config/feature-parity.test.ts`. Neues Feature → **beide** Dateien + ggf. Pfad-Zuordnung.
- **Pull-to-Refresh** lädt jetzt wirklich neu: alle gemounteten `useResource`-Instanzen leise im
  Hintergrund (`refreshAllResources`, kein Skeleton, Inhalte bleiben bei Fehlern sichtbar), Feature-
  Flags, eigenes Profil (`refreshUser`) und prüft auf eine neue App-Version (SW-Update → Reload).
  Offline/Fehler werden ehrlich gemeldet. Vorher: nur Toast + 500 ms Wartezeit.
- Tests: API 23/23, Frontend 76/76.

## B-48: UI/UX-Fixes (Claude · Anthropic)

- **Slider** scroll-sicher (siehe §6). **Seitengesten** neu: unten = Tabs, Mitte → rechts = zurück.
  **Tab-Wischen** in Developer-Admin und Profil.
- **Auth:** „Angemeldet bleiben“ funktioniert (aus → Token nur in `sessionStorage`); AGB-Haken Pflicht bei
  Registrierung; Registrieren-Name im API-Modus leer. **Drawer:** Nutzerkarte + Abmelden statt
  „Login/Registrieren“; Sidebar mit Abmelden.
- **Badges/Glocke:** „Meine Grows“ zählt aktive Grows (vorher statisch „2“); Glocke zeigt Zähler nur bei
  ungelesenen. Hook-Instanzen synchronisieren sich über `invalidate("notifications" | "grows")`.
  **Benachrichtigung antippen** → markiert gelesen und öffnet die passende View (`notification-target.ts`).
- **PWA-Installation:** echter `beforeinstallprompt`-Flow (`src/lib/pwa.ts`, `useInstallApp`), iOS-Anleitung,
  Eintrag im Drawer. **Icons korrigiert** (vorher 1254 px/1,2 MB statt 192/512 px → Chrome verweigerte
  die Installation) + maskierbares Icon + Manifest-`id`/Shortcuts.
- **Forum:** Up/Down-Votes (erneut klicken = zurücknehmen, eigener Vote sichtbar), Kommentar-Votes,
  Antworten auf Kommentare (bis 4 Ebenen), voller Thread-Text, Teilen.
- **Kommentare** zu Hall-of-Fame-Einträgen (alle Karten) und Social-Posts (`CommentsSheet`).
- **API/Migration `0003_votes_item_comments.sql`:** `comment_votes`, `item_comments`; `optionalAuth` für
  öffentliche Listen mit `myVote`; `POST /forum/comments/:id/vote`; Vote `delta: 0`;
  `GET/POST /hall/:id/comments`, `GET/POST /social/posts/:id/comments`; echte Kommentar-Zähler.
- Tests: API 22/22, Frontend 71/71.

## B-47: Foto-Uploads, Profil, Emoji, Teilen, Sammlung (Claude · Anthropic)

- **Bilder in PostgreSQL** (`media`-Tabelle, Migration `0002_media_collection.sql`): `POST /media`
  (roher Body, JPEG/PNG/WebP, **Format per Magic Bytes**, max. 2 MB, Quote 200 Bilder/100 MB je User),
  `GET /media/:id` (öffentlich per nicht erratbarer UUID – `<img>` kann keinen Bearer senden; CSP
  `default-src 'none'; sandbox`, `nosniff`), `DELETE /media/:id` (nur Eigentümer). Kein S3 nötig.
  Gespeichert wird der Pfad `/media/<uuid>`; das Frontend löst ihn mit `resolveMedia()` gegen die
  API-Basis auf (`SmartImage`, `Avatar`, Galerie). Referenzen: `imageRef` (eigener Upload oder HTTPS).
- **Client verkleinert** Fotos auf max. 1600 px JPEG (`src/lib/media.ts`) – entfernt dabei EXIF/GPS.
- **Neu nutzbar:** Social-Post mit Foto, Chat-Bildnachricht, Grow-Galerie „Foto hinzufügen“ (erstes Foto
  = Cover), Profil bearbeiten (`PATCH /auth/me`: Name, Titel, Avatar; Rolle nicht änderbar), Emoji-Auswahl
  (Social/Chat), Teilen (Share-Sheet bzw. Zwischenablage), Link kopieren (Social/Forum/Hall).
- **Sortensammlung** (`strain_collection`): `GET /strains/collection`, `POST /strains/:id/collect`
  (Toggle); Sorten-Seite: „Sammeln“ im Modal + Filter „Meine Sammlung“. Eigene Community-Sorten werden
  automatisch gesammelt. `strains.list()` liefert jetzt in **beiden** Modi den Katalog.
- **Deep-Links:** `/?view=<key>` öffnet öffentliche Views (Allowlist in `src/lib/nav.tsx`), Social
  scrollt zu `#post-<id>`.
- **Tests:** API 20/20 (u. a. SVG mit gefälschtem PNG-Header → 415, fremder Grow → 404,
  `role` in `PATCH /me` → 400), Frontend 64/64. Lokaler API-Testlauf: `npm run test:api:local`.

## B-46: Backend verbunden – Daten werden dauerhaft gespeichert (Claude · Anthropic)

- **Embedded-API:** `app/api/[...route]/route.ts` → `src/server/embedded-api.ts` lädt die Hono-App aus
  `apps/api` und leitet `/api/*` weiter (Präfix wird entfernt). Kein zweiter Prozess, same-origin, kein CORS.
  `/api/health` bleibt eine eigene, DB-freie Route (Plattform-Healthcheck).
- **Standard ist jetzt API-Modus:** `next.config.ts` setzt `NEXT_PUBLIC_API_URL` auf `/api`, falls nicht
  gesetzt. `NEXT_PUBLIC_API_URL=` (leer) → Demo-/Mock-Modus; externe URL → Docker-API.
- **Migrationen laufen automatisch** beim ersten API-Request (Drizzle-Migrator, `apps/api/drizzle`).
- **Env:** `DATABASE_URL` aus `.env` (plattformverwaltet, wird bei jedem Build neu geschrieben!).
  `JWT_SECRET` + `JWT_TTL` in **`.env.local`** (gitignored). Fehlt `JWT_SECRET`, erzeugt der Server in
  Entwicklung ein zufälliges Prozess-Secret (Warnung im Log, Sessions enden beim Neustart); in **Produktion**
  (`NODE_ENV=production`, z. B. `next start`) bricht die API mit 503 ab – außer `ALLOW_EPHEMERAL_JWT_SECRET=true`.
- **Rate-Limits (B-51):** `apps/api/src/middleware/rate-limit.ts` (In-Memory pro Prozess; bei mehreren
  Instanzen zusätzlich am Proxy limitieren). `TRUST_PROXY=false` ignoriert `X-Forwarded-For`,
  `RATE_LIMIT_DISABLED=true` schaltet ab.
- **`API_EMBEDDED=true`** (setzt der Adapter): S3 optional → Upload-Presign antwortet `503`;
  CORS-HTTPS-Regel entfällt (same-origin). Standalone/Docker unverändert streng (Test ergänzt).
- **Imports in `apps/api`:** relative Imports jetzt mit **`.ts`-Endung** + `rewriteRelativeImportExtensions`
  (tsc schreibt beim Emit zu `.js` um; `dist/` unverändert lauffähig). Nötig, weil Turbopack `.js`→`.ts`
  nicht auflöst.
- **Root-`package.json`** enthält die API-Laufzeitpakete (hono, drizzle-orm, postgres, zod, jose, argon2,
  aws-sdk) in denselben Versionen wie `apps/api` – bei Updates **beide** anheben.
- **Sandbox-DB (`app_db`)** migriert + Demo-Seed (Admin `admin@growobserver.local`, Katalog, Wiki, Grow,
  Community, Chat). Seed erneut: siehe `apps/api/README.md` (nur leere DB, nie Produktion).
- **Geprüft:** Neustart-Persistenz (Login/Tasks/Grows nach Server-Neustart vorhanden), 37 Frontend-
  Endpunkte gegen echte DB (alle 2xx), `401` ohne Token, `503` für Upload ohne Storage.

## B-45: Paket 3 + Backend-Routen (Claude · Anthropic)

- **Backend:** `POST /strains` (Community-Sorte, Auth), `POST /wiki` (Entwurf v0.1, Autor = Konto),
  `GET/POST /tasks`, `POST /tasks/:id/toggle` (strikt pro User, fremde IDs → 404).
  Migration **`drizzle/0001_tasks_authoring.sql`** (handgeschrieben, Journal-Eintrag idx 1): Tabelle
  `tasks`, Spalten `strains.created_by`, `wiki_articles.created_by`. Upgrade von 0000 mit Daten geprüft.
  Weiterhin **kein Drizzle-Snapshot** → neue Migrationen ebenfalls handschriftlich + Journal (§9.1).
- **Daten statt Mocks (3.1):** `useCurrentUser()` (`src/lib/auth.tsx`) in Shell/Profil/Social/Dashboard/
  Showcase – im API-Modus nie mehr Demo-Personendaten; Glocke/Benachrichtigungen via `useNotifications`,
  Breeder-Detail via `strains.catalog()`, Wiki-Tabs via `useWikiCategories`. Verbleibende Mock-Imports
  in Views sind **statische Demo-Inhalte ohne Backend-Domäne** (Liste in ARCHITECTURE.md).
- **Typen (3.2):** Domänen-Typen leben in `src/types/domain.ts` (via `@/types`); `mocks/data.ts`
  importiert sie nur noch.
- **Code-Splitting (3.3):** Views per `React.lazy` + `Suspense`; Bottom-Nav-Views werden im Leerlauf
  vorgeladen. Onboarding/Auth/NotFound bleiben eager (Shell-kritisch).
- **Audit (3.4):** Frontend **0 Advisories** (next 16.3.6, vite 7.3.6, postcss 8.5.28, vitest 4.1.11).
  API: drizzle-orm 0.45.3 (SQL-Injection-Fix), drizzle-kit 0.31.11; Rest: 4× moderat in drizzle-kits
  internem esbuild (nur CLI, kein Dev-Server) – akzeptiert.
- **`.npmrc` mit `legacy-peer-deps=true`** im Root: npm 10 stürzt sonst beim Auflösen der optionalen
  vitest-Peers ab (`edgesOut`). Alle echten Peers sind direkte Abhängigkeiten. Nicht entfernen, ohne
  vorher `rm -rf node_modules package-lock.json && npm install` erfolgreich zu testen.
  Folge: Pflicht-Peers werden nicht automatisch installiert → **`npm run check:peers`** (auch in CI).

## B-44: Frontend-Gesten, Schnellaktionen, Galerie, Sortenvergleich (Claude · Anthropic)

- Gesten: siehe §6 (Wischen im ganzen Panel, Toasts, Tab-Wischen ohne Drawer-Konflikt).
- **Neue View `create`** (`src/views/Create.tsx`, Metadaten `src/config/create-kinds.ts`):
  `navigate("create", { kind: "grow" | "log" | "strain" | "task" | "wiki", growId? })`. Validierte
  Formulare → Service-Layer → Toast → Ziel-View (Grow-Detail, Sorten, Dashboard, Wiki-Artikel).
  Eingebunden in FAB, Dashboard („Neuer Grow“, „+ Task“), Grows („Neuer Grow“, „+ Log“), Sorten,
  Wiki („Artikel erstellen“). Keine Demo-Toasts mehr für diese Aktionen.
- **Services:** `StrainService.create`, `WikiService.create`, neue `TaskService` (list/create/toggle),
  `useTasks`/`useWikiCategories`. Mock speichert Grows/Logs/Sorten/Tasks/Artikel für die Session.
  API-Routen dafür existieren seit B-45.
- **Sortenvergleich:** `src/data/compare.ts` (max. 3, localStorage `go-compare`), gemeinsam für
  Sorten-Seite (Karten-Button, Modal, Vergleichsleiste) und Planer (beste Werte markiert).
- **Hall of Fame:** Featured-Karte nutzt dieselbe Kartensprache wie das Raster und erscheint dort
  nicht doppelt; Karten brechen nicht mehr über Spalten (`break-inside-avoid` am Wrapper).

## Aktuelle Stabilisierung (B-38 … B-41, historisch)

- Backend: Node-22/NodeNext-kompatible `.js`-Imports und `dist/index.js`, Katalog-Namenskonflikt
  korrigiert, Drizzle-Relationen vervollständigt, Initialmigration eingecheckt.
- Docker: interne Hosts `db`/`minio`, getrennter Browser-Storage-Endpoint, One-shot-Migration und
  Bucket-Setup. Kein automatischer Demo-Seed, keine Standardpasswörter.
- Sicherheit: aktuelle DB-Rollen statt JWT-Rollen als Autorität; Chat-Mitgliedschaft,
  private Community-Filter, atomare Einmal-Einladung, Last-Admin-Schutz, authentifizierter Presign.
- PWA: nur explizite öffentliche Shell-Assets im Cache; keine APIs, privaten Antworten,
  signierten URLs oder externen Fotos. Alte `go-*`-Caches werden beim SW-Upgrade entfernt.
- Admin: die Seite nutzt nun `AdminService` für Health, Kennzahlen und Benutzerrollen;
  unbekannte Zustände bleiben unbekannt. Keine beliebigen Diagnose-URLs mit Token.
- Neue Tests/CI vorhanden, aber hier nicht ausgeführt. Dies ist kein Sicherheitszertifikat.

**Vor einem Live-Deploy zuerst die Tests aus `TESTING.md` ausführen.**

Lies zuerst dieses Dokument, danach `PLAN.md`, `ARCHITECTURE.md` und `apps/api/README.md`.
`MILESTONES.md` enthält den Produkt-Nordstern; Native Apps, Editionen und E2EE sind derzeit
bewusst zurückgestellt.

---

## 1. Aktueller Produktfokus

Jetzt wird eine **voll funktionsfähige PWA** mit selbst gehostetem Backend gebaut:

- Auth, Grow-Tagebuch, öffentliche/private Communities, Social Feed, Forum, Chat, Wiki
- Notifications, Marktplatz/Katalog, Tools und später serverseitige KI
- Feature-Flags aus Datei, Laufzeit-Overrides im Developer-Admin
- Developer-Admin für App-/Backend-Management
- Offline-fähige PWA-Shell und IndexedDB-Fallbacks

Zurückgestellt: Editionen, Native Android/iOS, E2EE/P2P und In-App-Purchases.

---

## 2. Was bereits implementiert ist

### Frontend

- React 19, TypeScript, Vite, Tailwind CSS v4
- Über 22 Screens inklusive Developer-Admin und Communities
- Mobile Shell, Bottom-Sheets, Swipe-/Long-Press-/Pull-to-Refresh-Gesten, Safe-Area
- Auth-Gate und Session-Provider
- Feature-Flags in `src/config/features.ts` + Overrides im `FeatureProvider`
- Global Search über Navigation, Sorten, Threads und Produkte
- Error Boundary, Skeletons, Empty/Error States, Toasts und Focus-Traps

### Service- und Data-Layer

Die produktiven Pages greifen über `src/data/hooks.ts` auf `src/services/index.ts` zu.
Die Factory wählt anhand von `NEXT_PUBLIC_API_URL` (Vite-Legacy: `VITE_API_URL`):

```text
leer    -> mockServices
gesetzt -> apiServices
```

Implementierte Service-Domänen:

- Grows, Social, Strains, Wiki, Forum, Chat, Notifications
- Products/Offers, Breeders, Hall of Fame, Activity
- Communities
- Developer-Admin-Vertrag

### Communities-MVP

- Neue View `communities`
- Öffentliche/private Communities
- Suche, Erstellen, öffentlich beitreten
- Privater Beitritt per Einladungscode
- Mitglieder/Rollen in der Detailansicht
- Invite-Code-Erstellung durch Admins
- Mock-Code: `demo-private`
- Backend-Routen für List/Get/Create/Join/Invite/Rolle

### Self-Host-Backend

Pfad: `apps/api`

| Bereich | Technologie |
|---|---|
| HTTP | Hono + Node Server |
| Datenbank | PostgreSQL 16 |
| ORM | Drizzle ORM |
| Auth | JWT (`jose`) + Argon2 |
| Storage | MinIO / S3-kompatibel |
| Betrieb | Docker Compose |

Vorhandene Backend-Domänen:

- Auth, Grows, Social, Forum, Chat, Notifications
- Products, Offers, Breeders, Strains, Hall, Wiki, Activity
- Communities inklusive Invite/Rollen
- Admin-Routen für Health, Stats, User und Content
- Presigned S3/MinIO Upload

`apps/api/README.md` ist die operative Backend-Dokumentation.

---

## 3. Sofort starten

### Frontend (Mock-Modus)

```bash
npm install
npm run dev            # Next.js Dev-Server (http://localhost:3000)
npx next typegen && npm run typecheck && npm run lint && npm test
npm run build          # Next.js Production-Build
npm run build:vite     # optional: Vite-Legacy → dist/index.html (Single-File)
```

### Backend (Docker)

```bash
cd apps/api
cp .env.example .env
# JWT_SECRET, POSTGRES_PASSWORD und S3_SECRET_KEY mit getrennten Zufallswerten füllen.
docker compose up --build
```

Erwartete Dienste:

```text
API            http://localhost:8787
Health         http://localhost:8787/health
MinIO API      http://localhost:9000
MinIO Console  http://localhost:9001
PostgreSQL     localhost:5432
```

Ein Demo-Admin wird nicht automatisch angelegt. Für eine leere Entwicklungsdatenbank
`SEED_ADMIN_EMAIL` und ein eigenes Passwort (mindestens 12 Zeichen) setzen und explizit
`docker compose --profile demo run --rm seed` ausführen. Nicht für Produktion.

Frontend in API-Modus:

```bash
# Standard (B-46): eingebettete API unter /api – nichts setzen.
NEXT_PUBLIC_API_URL=http://localhost:8787   # nur für externe Docker-API (Build-Zeit!) · leer = Mock
```

`apps/api/.env`:

```bash
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

---

## 4. Wichtige Pfade

```text
src/
  App.tsx
  config/features.ts
  config/FeatureContext.tsx
  data/DataContext.tsx
  data/hooks.ts
  services/interfaces.ts
  services/mock.ts
  services/api.ts
  services/index.ts
  lib/api.ts
  lib/auth.tsx
  lib/config.ts
  lib/db.ts
  lib/diagnostics.ts
  lib/hooks.ts
  views/Communities.tsx      # ehemals src/pages (in Next reserviert)
  views/DevAdmin.tsx
  lib/pwa.ts                 # SW-Registrierung (Next + Vite)
  lib/asset.ts               # assetSrc(): Bild-Import Vite/Next vereinheitlicht

app/
  layout.tsx                 # Metadata, Theme-No-FOUC, Fonts
  page.tsx                   # SPA-Hülle (dynamic, ssr:false)
  api/health/route.ts        # Plattform-Healthcheck

  lib/session-storage.ts     # Token-Keys (Mock vs. API) + Logout-Bereinigung
  data/useResource.ts        # last-request-wins Laden (Basis aller Daten-Hooks)

apps/api/
  docker-compose.yml         # db, minio, migrate, storage-init, api, seed (Profil "demo")
  Dockerfile                 # Stages: tools (Build/Migration) + runtime (non-root)
  .dockerignore
  seed.ts                    # opt-in Demo-Seed, transactional
  drizzle/0000_initial.sql   # eingecheckte Initialmigration (+ meta/_journal.json)
  tsconfig.json              # Runtime: rootDir src, NodeNext
  tsconfig.tools.json        # Tools+Tests: seed, drizzle.config, tests
  src/app.ts                 # Hono-App-Factory (ohne Port) → für app.request()-Tests
  src/index.ts               # Port-Start + Graceful Shutdown
  src/env.ts                 # lädt .env (Node 22) + validiert
  src/config/environment.ts  # Zod-Schema inkl. Production-HTTPS-Regeln
  src/db/{client,schema,migrate,storage-init}.ts
  src/lib/{jwt,password,s3,time,health,validation}.ts
  src/middleware/auth.ts
  src/routes/{auth,grows,social,forum,chat,notifications,catalog,communities,admin}.ts
  tests/{environment,security.integration}.test.ts

public/sw-policy.js          # Cache-Allowlist, auch von Node-Tests ausgeführt
vitest.backend.config.ts     # API-Integrationstests (Root-Runner)
```

Provider-Hierarchie:

```text
ThemeProvider
  I18nProvider
    AuthProvider
      DataProvider
        FeatureProvider
          ToastProvider
            NavProvider
              Shell
```

---

## 5. Views und Feature-Flags

```text
dashboard grows strains ai planner breeders marketplace wiki forum hallOfFame
social communities showcase calculator consumption simulation report chat
notifications profile telegram auth devAdmin
```

Feature-Defaults: `src/config/features.ts`.

Ausgeschaltete Features verschwinden aus Nav, Mobile-„Mehr“ und Command-Palette. Direkter
View-Zugriff zeigt einen EmptyState. Das ist keine Security Boundary; der Server muss später
dasselbe Flag/Policy-Gate prüfen.

---

## 6. Touch-UX: nicht zurückbauen

- **B-44 – Wischen im gesamten Panel** (`src/lib/gestures.ts` → `useSwipeToDismiss`): Drawer,
  BottomSheet und Mobile-Modal folgen dem Finger überall, nicht nur am Griff/Rand. Übernahme nur in
  Schließ-Richtung und wenn der Inhalt am Anschlag steht (Sheet: `scrollTop === 0`) – sonst scrollt
  der Inhalt nativ. Formularfelder, Slider und `[data-no-swipe]` starten nie eine Geste.
  Maus/Stift: weiterhin Header-Drag über Framer `dragControls` (Touch dort ignoriert → kein Doppel-Drag).
- Toasts: ganze Fläche wischbar (links/rechts/unten) zum Schließen.
- **Seitengesten (B-48, `usePageSwipe`)**: **untere Zone** (30 % Viewport, mind. 180 px) links/rechts =
  Bottom-Nav-Tab wechseln; **mittlere Zone nach rechts = zurück** (nur mit History); nach links = nichts.
  Konfliktfrei zum Drawer: 32-px-Randzonen ignoriert (Edge-Swipe nutzt 16 px), inaktiv bei offenem
  Dialog (`[aria-modal]`), in horizontal scrollbaren Bereichen, Formularen, `[data-no-tab-swipe]`.
- **In-Page-Tabs wischen** (`useSwipeTabs`): Developer-Admin, Profil. Container erhält `data-swipe-tabs`,
  die globale Geste greift dort nicht.
- **Slider (B-48)**: Touch verstellt erst nach eindeutig horizontaler Bewegung oder kurzem Tipp;
  vertikal scrollt die Seite. Nicht auf natives Touch-Verhalten von `<input type="range">` zurückbauen.
- Menü öffnen: `useEdgeSwipeToOpen` als passiver Window-Listener, kein Overlay-Element
- Long-Press: bricht bei mehr als 10 px Bewegung ab
- Pull-to-Refresh: deaktiviert in Overlays und Formularfeldern
- Mobile TopBar: dauerhaft Burger-Menü
- Drawer/Sheet/Modal: Snapback bei abgebrochener Geste. Scroll-Lock ist ref-counted/iOS-sicher.
- **`SwipeLightbox` ist Vollbild** (eigenes Portal, z-120, kein Modal/Sheet mehr): Bild zentriert,
  seitlich wischen = blättern, nach unten = schließen (Hintergrund blendet aus), Doppeltipp = Zoom,
  Thumbnails, ←/→/Esc, Pfeile ab `sm`. Genutzt von Grow-Galerie + Hall of Fame.
- Edge-Swipe ist auf iOS deaktiviert (System-Back); Burger ist der verlässliche Öffnungsweg.

Weiter testen auf echten Geräten: iOS Safari, Android Chrome, lange Sheets, horizontale Scroller.

---

## 7. Harte Fallstricke

### Vite-Build prüft keine Typen

`npm run build` kann grün sein, obwohl ein Import fehlt. Nach Import-/Registry-Änderungen immer:

```bash
npx tsc --noEmit
```

### Keine parallelen Edits derselben Datei

Dadurch gingen in diesem Projekt bereits Imports, Registrierungen und Backend-Routen verloren.

### Tailwind v4 / PostCSS

- CSS-basierte Config in `src/index.css`
- Root-`postcss.config.mjs` ist **nur für Next**; `vite.config.ts` muss `css.postcss` inline
  behalten, sonst verarbeitet Vite Tailwind doppelt
- kein `tailwind.config.js`
- kein Ordner namens `pages/` in `src/` oder im Root (Next Pages Router)
- **`source(none)` ist aktiv.** Tailwind v4 scannt sonst *jede* Projektdatei (auch `*.md`,
  `apps/api/**/*.ts`, `drizzle/*.sql`) und bläht das CSS bei jeder Doku-Änderung auf.
  Registrierte Quellen: `@source "."` (= `src/`), `../index.html`, `../app`.
  **Neue UI-Ordner außerhalb von `src/` müssen dort nachgetragen werden**, sonst fehlen
  deren Klassen stillschweigend im Build.

### Layout

- Custom CSS Properties immer mit Einheit: `"272px"`
- `body` nutzt `overflow-x: clip`, nicht `hidden`
- neue String-Icons in `src/components/Icon.tsx` registrieren

### Backend

- Secrets nur in `apps/api/.env`; `.env.example` enthält bewusst leere/`CHANGE_ME`-Werte
- `/admin/*`: `requireAuth` und `requirePlatformAdmin`; Rolle kommt aus der DB, nicht aus dem JWT
- Ownership- und Mitgliedschafts-Checks auf User-Ressourcen (Grows, Chat, private Communities)
- Feature-Flags: global in `feature_flags`, API sperrt mit 403 (B-49)
- **Imports (B-46):** relative Imports in `apps/api` mit **`.ts`**-Endung (`./env.ts`);
  `rewriteRelativeImportExtensions` macht daraus beim Build `.js`. Keine `.js`-Imports mehr einführen –
  Turbopack (Embedded-API) kann sie nicht auflösen
- **Drizzle:** jede `many()`-Relation braucht die Gegenrichtung, sonst schlagen `db.query.*` fehl
- **Migrationen:** `drizzle/0000_initial.sql` ist handgeschrieben und nur für eine **leere** Datenbank.
  Vor `db:generate` auf einer bestehenden Installation erst eine saubere Baseline erstellen,
  sonst drohen doppelte `CREATE`-Statements
- **Upload:** Presign signiert gegen `S3_PUBLIC_ENDPOINT`; die Hostname der Signatur darf nicht
  nachträglich umgeschrieben werden (bricht die Signatur)

---

## 8. Noch offen

- Docker-Stack wurde in dieser Agent-Umgebung nicht real gestartet (Docker nicht verfügbar)
- `apps/api`: Integrationstests (34) laufen gegen PostgreSQL 17 (B-51); Docker-Stack ungetestet
- Dashboard & weitere Views zeigen im API-Modus noch statische Demo-Daten (`src/mocks/data`: Strains, Simulation, Consumption, Showcase, Wiki, Calculator, Social, Dashboard, AIAssistant)
- Communities: Feed-Scope, Kick, Hide und Mod-Queue fehlen; Rechte-/Invite-Tests sind geschrieben,
  ihre Ausführung gegen PostgreSQL steht aus
- Realtime/Presence fehlen
- AI ist weiterhin UI/Mock; kein Server-Proxy
- Developer-Admin: Feature-Flags global + serverseitig durchgesetzt (B-49). Offen: revisionssicheres
  Audit (nur `updated_by`/`updated_at`), echte Kontosperren, Rollout nach Nutzergruppen/Prozent
- Uploads (B-47): DB-Speicher mit Magic-Byte-Prüfung, Quote und clientseitiger EXIF-Entfernung.
  Offen: Virenscan, serverseitige Neukodierung, private Bilder (Download-Autorisierung), Aufräumen
  verwaister Uploads
- Next.js ist aktiv als SPA-Hülle (B-42); File-based-Routing und Monorepo (`apps/web`) stehen aus
- API-Integrationstests, Browser-E2E (Playwright, B-51) und CI-Jobs existieren; Docker und echte Geräte (iOS/Android-Touch) noch unbestätigt
- Sitzungen: seit B-54 HttpOnly-Cookie + serverseitiger Widerruf (Tabelle `sessions`); offen sind Passwort-ändern,
  Anmeldeprotokoll, Gerätelimit
- Abhängigkeiten-Audit (B-45): Frontend 0; API 4× moderat (drizzle-kit/esbuild, nur CLI)

---

## 9. Nächste Schritte

### 9.1 Erster Lauf für den Backend-Agenten (Pflicht, in dieser Reihenfolge)

> **B-42:** Schritte 1–3 wurden ausgeführt und sind grün (1 Typfehler in `migrate.ts` behoben,
> Install-Abbruch durch `vitest`-devDependency behoben). **Offen ist nur Schritt 4 (Docker).**

```bash
# 1) API-Abhängigkeiten + beide Typechecks (erwartbar: Korrekturen nötig)
npm install --prefix apps/api
npm run typecheck --prefix apps/api          # Runtime-Code (src/)
cd apps/api && npx tsc -p tsconfig.tools.json && cd ../..   # seed, drizzle.config, tests

# 2) API bauen (erzeugt dist/index.js)
npm run build --prefix apps/api

# 3) Integrationstests gegen eine WEGWERF-Datenbank (Name muss auf _test enden)
#    Die Suite löscht ihre Daten per TRUNCATE — niemals gegen eine echte Installation richten.
TEST_DATABASE_URL=postgres://grow_test:grow_test@127.0.0.1:5432/growobserver_test \
  npx vitest run --config vitest.backend.config.ts

# 4) Erst danach: Docker-Stack
cd apps/api && cp .env.example .env   # CHANGE_ME/leere Werte mit echten Secrets füllen
docker compose up --build             # migrate + storage-init laufen als One-shot-Jobs
```

Erst wenn 1–4 grün sind, ist die API als "lokal lauffähig" zu betrachten.

> **Größte Falle bei Schema-Änderungen:** `drizzle/0000_initial.sql` ist handgeschrieben und hat
> **keinen generierten Snapshot** (`drizzle/meta/0000_snapshot.json`). Ein späteres
> `npm run db:generate` diffed daher gegen "nichts" und erzeugt das komplette Schema erneut →
> doppelte `CREATE TABLE`-Fehler. Vor der ersten generierten Migration einen passenden Snapshot
> in einer Wegwerf-Datenbank erstellen bzw. die bestehende Installation sauber baseline'n.

### 9.2 Danach (Reihenfolge)

1. Frontend mit `NEXT_PUBLIC_API_URL=http://localhost:8787` bauen und API-Modus durchklicken
2. E2E erweitern (Basis steht seit B-51: Register/Login, Grow, Forum, Mobile): Post, Community-Invite, DevAdmin-Health
3. DevAdmin-Live-Checks verifizieren; serverseitige Flag-Freigaben und Audit ergänzen
4. Communities: Kick, Hide, Mod-Queue und Community-Feed-Scope
5. SSE/Realtime für Chat und Notifications
6. AI-Proxy serverseitig
7. PWA Offline-Queue und Sync-Härtung
8. Danach Next.js-Ausbau: File-based-Routing statt `useNav`, danach Vite-Legacy entfernen

---

## 10. Definition of Done

Frontend:

```bash
npm run build
npx tsc --noEmit
npx vitest run
```

Backend:

```bash
cd apps/api
npm install
npm run typecheck
npx tsc -p tsconfig.tools.json
```

PostgreSQL-Integration vom Root: `npx vitest run --config vitest.backend.config.ts`.
Nur mit einer separaten `*_test`-Datenbank, da Testdaten gelöscht werden.

Zusätzlich:

- `npm run version:check` grün; **Build-Nummer setzen** (`npm run version:build`) – Versionen nur auf Anweisung des Eigners
- Preview starten (`npm run preview`) und die aktuelle Preview-URL mitteilen
- Mobile und Desktop prüfen
- Mock- und API-Modus testen
- CHANGELOG und PROGRESS aktualisieren
- API-Vertrag in `apps/api/README.md` und `ARCHITECTURE.md` nachziehen

---

## 11. Ein-Satz-Handoff

> Frontend/PWA läuft als Next.js-SPA-Hülle (Vite nur noch Legacy), die Self-Host-API ist
> typgeprüft, gebaut und mit 13/13 Integrationstests grün — offen ist der Docker-Stack (§9.1 Schritt 4),
> danach E2E im API-Modus (§9.2).

---

> B-42: Claude (Anthropic), 2026. Vorherige Überarbeitung: Codex (OpenAI). Historische Einträge bleiben erhalten.
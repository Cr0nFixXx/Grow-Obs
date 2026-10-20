# CHANGELOG.md

Alle nennenswerten Änderungen an **Grow|Observer**, je Aufgabe (B-Nummer) mit den **gemessenen** Prüfergebnissen („Geprüft“, „Tests“, „Nicht geprüft“).
Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/). Die Ein-Zeilen-Übersicht je Aufgabe steht in [`PROGRESS.md`](PROGRESS.md)
(das vollständige alte Protokoll mit Bundle-Größen: `archive/PROGRESS-bis-B62.md`).

**Versionen:** Seit B-52 steuert `version.json` die Versionen (Frontend „Ruderalis“ 0.1.1, Backend 0.0.2; vom Eigner vergeben). Die frühere Zählung (`v0.x`, zuletzt 0.50.0)
und die B-Nummern vor B-52 sind historisch und bleiben unverändert. Neue Einträge tragen keine Agenten-Signatur und nennen ihre Prüfergebnisse selbst; Teststand und offene Gates: `docs/TESTING.md`.

---

## [Unreleased] – Frontend „Ruderalis“ 0.1.1 · Backend 0.0.2 (seit B-52)

### B-68 – Chrome-Suchleiste beim Markieren, Fehlerdiagnose der API

Versionen unverändert (Eigner vergibt), nur die Build-Nummer wurde aktualisiert.

- **Markieren:** Chrome Android blendete nach dem Entfernen des Übersetzen-Banners (B-67) beim langen Drücken die eigene Leiste „Suchergebnisse anzeigen“ ein. Sie kommt aus Chrome, die Seite kann sie nicht abschalten. Entscheidung des Eigners: Die Oberfläche ist jetzt **überall nicht markierbar** (`body { user-select: none; -webkit-touch-callout: none }`); nur Eingabefelder (`input`, `textarea`, `contenteditable`) bleiben markierbar. Folge: Nachrichten, Beiträge und Wiki-Texte lassen sich nicht mehr durch Markieren kopieren.
- **API-Log:** `api_error` (HTTP 500 „Interner Fehler“) enthält zusätzlich Methode, Pfad (UUIDs als `:id`), den Postgres-/Treiber-Fehlercode und die auf 120 Zeichen gekürzte Meldung der Ursache. Kein SQL, keine Parameter. Anlass: auf Vercel schlugen einzelne Chat-Nachrichten mit „Interner Fehler“ fehl; die Ursache war aus dem Log nicht ablesbar.
- **Geprüft:** typecheck ✅ · lint ✅ · Vitest 226/226 · Build ✅ · E2E `mobile.spec.ts` 2/2 (prüft `user-select`: Oberfläche `none`, Eingabefeld `text`).
- **Nicht geprüft:** die Chrome-Leiste auf einem echten Android-Gerät; die API-Tests (Log-Erweiterung nur per typecheck), E2E der Desktop-Specs (nur eine CSS-Regel betroffen); die Ursache der 500er (offen, Laufzeit-Log von Vercel nötig).

### B-67 – Mobil: Zoom aus, kein Übersetzungsangebot, Chat passt auf den Bildschirm

Versionen unverändert (Eigner vergibt), nur die Build-Nummer wurde aktualisiert.

- **Ursache „Seite lässt sich verschieben/zoomen“:** Der Chat war breiter als der Bildschirm (Kopfzeilen-Knöpfe, Eingabezeile; Spalte mit `min-content`-Breite). Chrome Android weitet dann den Layout-Viewport auf und verkleinert die Seite (gemessen: `innerHeight` 761 gegen `visualViewport` 727). Zusätzlich verschob `scrollIntoView` beim Scrollen der Nachrichten die ganze Seite, und die Kopfzeile lief bei 360 px um 8 px über.
- **Chat auf Telefon/Tablet (< 1024 px):** geöffnete Unterhaltung als Vollbild-Ebene (Portal an `document.body`, `fixed inset-0`, unter Safe-Area-Rändern), Nachrichten scrollen intern (`overscroll-contain`), Eingabefeld immer sichtbar; Liste im normalen Seitenfluss; Knöpfe der Kopfzeile umbrechen. Desktop unverändert. Der runde Schnellaktions-Knopf ist im Chat ausgeblendet (verdeckte „Senden“). Eingabefeld 16 px auf Telefon (kein Auto-Zoom auf iOS). Nachrichten scrollen nur noch den eigenen Bereich.
- **Zoom:** Viewport-Meta `maximum-scale=1, user-scalable=no`, `interactive-widget=resizes-content`; `html { touch-action: pan-x pan-y }`. Abwägung: Das nimmt sehbehinderten Nutzern das Vergrößern (WCAG 1.4.4). iOS Safari ignoriert `user-scalable=no` teilweise.
- **Übersetzen:** `<html translate="no">` und `<meta name="google" content="notranslate">`. Das Chrome-Übersetzungsangebot beim Markieren kommt aus Chrome selbst; die Seite kann es mit diesen Hinweisen nur unterdrücken, nicht erzwingen.
- **Kopfzeile:** Markenschrift unter 400 px etwas kleiner (kein Überlauf bei 360 px).
- **Geprüft:** typecheck ✅ · lint ✅ · Vitest 226/226 · Build ✅ · E2E 40 bestanden, 1 übersprungen (Desktop 38, mobil 2).
- **Test:** `e2e/mobile.spec.ts` (neu): Viewport-/Übersetzungs-Meta; Liste und offener Chat bei 360×600, 393×727 und Querformat 740×360 ohne horizontalen Überlauf und ohne Seiten-Scroll, Eingabefeld sichtbar, letzte Nachricht unten, Zurück zur Liste.
- **Nicht geprüft:** echtes Chrome auf einem Android-Gerät (nur Chromium-Emulation Pixel 5), iOS Safari, Bildschirmtastatur (`resizes-content` ungetestet), das Übersetzungsangebot selbst. Das Modal „Neue Nachricht“ im Querformat 740×360 blieb im Test von der Abdeckung überlagert (nicht untersucht, außerhalb dieser Aufgabe).

### B-66 – Vercel-Betrieb (Verbindungen, Polling, Diagnose)

Versionen unverändert (Eigner vergibt), nur die Build-Nummer wurde aktualisiert.

- **Anlass:** Auf Vercel + Supabase (Session Pooler) antwortete die eingebettete API zeitweise mit 503 „Backend nicht verfügbar“ (`Failed query: CREATE SCHEMA IF NOT EXISTS "drizzle"`). Aus den Logs: Fehler in Wellen (bis 199 × 503 in einer Minute), Antwortzeit ≈ 100 ms (abgelehnt, kein Timeout), keine fehlgeschlagene Abfrage in Postgres, 21 Instanzen in 13 Minuten, 300-s-SSE-Ströme je Tab. Wahrscheinliche Ursache: der Pooler ist voll (die Pooler-Logs lagen nicht vor – nicht bewiesen).
- **`DB_POOL_MAX`** (Standard 10, 1–50) begrenzt die Verbindungen je Instanz; **`SKIP_MIGRATIONS=true`** überspringt den Migrationslauf beim Start; beide nur Opt-in, das Standardverhalten ist unverändert.
- **Reines Polling:** `NEXT_PUBLIC_REALTIME=polling` (Build-Zeit) öffnet weder WebSocket noch SSE; Status `polling`, alle 8 s ein Neuladen bei sichtbarem Tab. Auf Vercel-Builds ist das der Standard (`next.config.ts`), `NEXT_PUBLIC_REALTIME=auto` stellt das alte Verhalten wieder her. Folge: kein Online-Status, kein „schreibt …“ in diesem Modus.
- **Diagnose:** `embedded_api_boot_failed` protokolliert zusätzlich `causeCode` und `cause` (Treiberfehler, gekürzt, ohne Zugangsdaten).
- **Supabase (Betrieb, kein Code):** Row Level Security auf allen 43 Tabellen in `public` aktiviert (Linter: „RLS Disabled in Public“); die App verbindet sich als Tabellenbesitzer und ist nicht betroffen.
- **Geprüft:** typecheck ✅ · lint ✅ · Vitest 226/226 (neu 4: `pollingOnly`, `config.realtimeMode`) · API 221/221 (neu 2: `DB_POOL_MAX`, `SKIP_MIGRATIONS`) · `next.config.ts` liefert `polling` mit `VERCEL=1` und `auto` ohne ✅ · produktive Vercel-Seite antwortet nach RLS weiter (`/api/releases`, `/api/features`, `/api/version` 200).
- **Nicht geprüft:** Verhalten unter Last auf Vercel (Pooler-Auslastung nach den Änderungen), ein Vercel-Build mit gesetztem `VERCEL`, E2E (nur der Standardmodus `auto` ist betroffen, nicht neu gelaufen).

### B-65 – Gruppenchats

Versionen unverändert (Eigner vergibt), nur die Build-Nummer wurde aktualisiert.

- **Funktion:** Gruppen mit Name (Pflicht, ≤ 60 Zeichen), Gruppenbild (Upload), Rollen und Themen. Der Ersteller ist Admin; **Beitritt nur per Einladung mit Annahme** (7 Tage gültig, Admin kann zurückziehen, Hinweis in der Glocke plus Push, Banner über der Chatliste). Nur Admins laden ein, entfernen, benennen um und verwalten Themen; alle dürfen gehen (ohne Admin rückt das am längsten dabei seiende Mitglied nach, die letzte Person löscht die Gruppe). Höchstens 20 Mitglieder **inklusive offener Einladungen**, 20 offene Einladungen je Person.
- **Themen (wie Telegram-Foren):** Standardthema „Allgemein“ (nicht löschbar), Name + Emoji, schließen/öffnen, „nur Admins schreiben“, anheften, Reihenfolge, **private Themen** mit eigener Mitgliederliste (Admins sehen sie immer), persönliche Stummschaltung, Ungelesen-Zähler je Thema (stumme zählen nicht in Liste, Badge und Push). Höchstens 50 Themen.
- **Verlauf:** Neue Mitglieder sehen standardmäßig nur Nachrichten ab ihrem Beitritt; Admins können den älteren Verlauf freigeben (`historyVisible`). Hinweiszeilen („Anna hat Bernd eingeladen“, „… ist der Gruppe beigetreten“, „… hat die Gruppe verlassen“, umbenannt, Thema erstellt/geschlossen) lösen weder Zähler noch Push aus.
- **Echtzeit/Push:** `chat.message` mit `topicId` an die Zielgruppe des Themas, neues Ereignis `chat.group` (Mitglieder, Themen, Einladungen), „schreibt …“ je Thema. Gruppen-Push: Titel = Gruppenname, „Absender: Text“ nur mit „Vorschau anzeigen“ (sonst neutral), Tag je Thema.
- **API/DB:** Migration `0014_chat_groups` (siehe `ARCHITECTURE.md`), neue Routen unter `/chat/groups`, `/chat/invites` (siehe `apps/api/README.md`); Nachrichten tragen `senderId`, `senderName`, `kind`, `topicId`.
- **Frontend:** „Neue Gruppe“, Gruppen-Info (Allgemein, Mitglieder mit Einladungen, Themen), Themenleiste mit Zähler/Schloss, Absendernamen und Hinweiszeilen im Verlauf, gesperrte Eingabe mit Begründung. Die Demo (Mock) kennt keine Gruppen und blendet die Schaltflächen aus.
- **Geprüft:** typecheck ✅ (Frontend, API) · lint ✅ · Vitest 222/222 (neu 19: Hilfsfunktionen, `NewGroupModal`, `InviteBanner`, `TopicBar`, `useChat` mit Themen) · API 219/219 (neu 27, u. a. Rechte, Einladungen inkl. Ablauf und Obergrenze unter Parallelität, privater Zugriff, Verlauf, Zähler, Stummschaltung, Push-Inhalt, Migration) · E2E 39 bestanden, 1 übersprungen (neu: zwei Nutzer legen Gruppe an, Einladung annehmen, Thema, Nachricht, Schreibsperre – live) · `next build` ✅ · Oberfläche per Screenshots gesichtet.
- **Nicht geprüft:** Gruppen-Push auf einem echten Gerät, Darstellung auf kleinen Telefonen über den E2E-Viewport hinaus (Themenleiste scrollt waagerecht), Gruppen mit 20 echten Mitgliedern im Browser. **Bewusst nicht gebaut:** Einladungslink, Gruppe löschen, Admin ernennen.

### B-64 – PNG-App-Icons

Versionen unverändert, nur die Build-Nummer wurde aktualisiert.

- **Problem:** `public/manifest.webmanifest` verweist auf `icon-192.png`, `icon-512.png` und `icon-maskable-512.png`; die Dateien fehlten seit `2a81529` (damals 1,2-MB-Dateien entfernt). Folge: Push-Meldungen ohne Icon, Android-Installierbarkeit unsicher.
- **Lösung:** drei neue PNGs, aus `public/icon.svg` mit Chromium gerendert: `icon-192.png` (16 KB), `icon-512.png` (99 KB), beide mit transparenten Ecken; `icon-maskable-512.png` (78 KB) vollflächig, Blatt auf 66 % in der Sicherheitszone (Maskable-Mitte 80 %). Zusammen ≈ 190 KB.
- **Geprüft:** Bilder gesichtet ✅ · Größen/Modi per Skript ✅ · vitest ✅ · `next build` ✅. **Nicht geprüft:** Aussehen in einem echten Launcher (Maskable-Zuschnitt), Installation auf Android.

### B-63 – Web-Push

Versionen unverändert (Eigner vergibt), nur die Build-Nummer wurde aktualisiert.

- **Funktion:** Benachrichtigungen erreichen Geräte, auf denen die App geschlossen ist. Auslöser: jede In-App-Benachrichtigung (`createNotification`) und neue Direktnachrichten (nur an die anderen Mitglieder). Kategorien `messages`, `community`, `grows` (Typen grow, task), `other` (shop, ai, system), alle standardmäßig an.
- **Datenschutz:** Auf dem Sperrbildschirm steht standardmäßig nur „Neue Nachricht“ o. Ä. (kein Name, kein Text); „Vorschau anzeigen“ (Standard aus) zeigt Absender und Textanfang.
- **Wann nicht:** Push-Dienst nicht eingerichtet, Feature `push` aus, Kategorie abgeschaltet, Ruhezeit (Zeitzone des Browsers, Fenster über Mitternacht möglich), Nutzer ist online (Live-Verbindung), gleiche Gruppe in den letzten 15 s. Die In-App-Benachrichtigung bleibt davon unberührt; ein Versandfehler lässt nie eine Anfrage scheitern.
- **Geräte:** Abo je Gerät (höchstens 5, ältestes fällt weg), an die Sitzung gebunden (Abmeldung/„Alle Geräte“ löschen es), bei 404/410 oder nach 5 Fehlschlägen entfernt. Endpunkte nur von bekannten Push-Diensten (SSRF-Schutz).
- **Betrieb:** `web-push`, VAPID-Schlüssel einmalig per `npm run push:keys` (`apps/api`), Umgebungsvariablen `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (alle drei oder keine; ohne sie ist Push aus und die App sagt das). Neues Feature-Flag `push` (Admin-schaltbar, Paritätstest).
- **API/DB:** Migration `0013_web_push` (`push_subscriptions`, `push_prefs`), Routen `/push/*` (siehe `apps/api/README.md`).
- **Frontend:** Service Worker (`public/sw-push.js`, Ereignisse `push` und `notificationclick`, nur App-Pfade als Ziel), Karte „Push-Benachrichtigungen“ im Profil (Gerät aktivieren, Kategorien, Vorschau, Ruhezeit, Test, Geräteliste), `PushBridge` (Abo mit Sitzung abgleichen, Klick → Ansicht). Der frühere Schalter „Push-Benachrichtigungen“ war nur lokal und ohne Wirkung und entfällt; im Demo-Modus erscheint ein ehrlicher Hinweis. iOS: Hinweis, dass Push nur in der installierten App (16.4+) geht.
- **Geprüft:** typecheck ✅ (Frontend, API, Tests) · lint ✅ · Vitest 203/203 · API 192/192 (neu 37, u. a. Versand mit Fake-Sender, echte `web-push`-Bibliothek erzeugt eine verschlüsselte, signierte Anfrage) · E2E 38 bestanden, 1 übersprungen · `next build` ✅ · `build:vite` ✅.
- **Nicht geprüft:** Zustellung an ein echtes Gerät (Android, iOS-PWA, Sperrbildschirm), Verhalten hinter Proxys, der übersprungene E2E-Test (Gerät aktivieren; die Headless-Sandbox verweigert die Berechtigung). Die PNG-Icons des Manifests fehlten im Repository (seit `2a81529`), siehe B-64.
- **Nebenbei:** zwei Lint-Fehler aus früheren Aufgaben behoben (`promo-kit/tools/manifest.mjs`, `scripts/check-doc-links.mjs`).

### Docs – Motion-Graphics-Promo-Kit `promo-kit/` (nach B-62)

Kein Produktcode geändert; Versionen unverändert, nur die Build-Nummer wurde aktualisiert.

- **Kit (nur Quellen, keine Videos):** generische 3D-Engine (`engine/`, Szenen als JSON, Inter/Space Grotesk offline), Hero-Szene `scenes/promo-60s.json` (60 s, 16:9, 140 BPM) und 16 Key-Visual-Szenen, Soundtrack-Synthese aus den Szenendaten (`audio/audio.py`), Render-Werkzeuge mit Wiederaufnahme und Neustart bei Chromium-Absturz.
- **Material:** 38 echte Demo-Screenshots (Mock-Modus, mobil und Desktop), 25 transparente Geräte-Mockups, 16 Key-Visuals (4 Motive × 4 Formate), Brand-Assets (Icon als exakte Kopie von `public/icon.svg`, Wortmarke, Lockup, `tokens.json`).
- **Doku (Englisch):** `promo-kit/README.md`, `BRIEF.md` (Ehrlichkeitsregeln, Look, Story, QA-Liste), `docs/ENGINE.md`, `copy.json` (deutsche Bildschirmtexte), `manifest.json`.
- **Doc-Map:** `CLAUDE.md` §5, `README.md` und `HANDOFF.md` kennen `promo-kit/`.
- **Loop:** `promo-kit/tools/loop.sh` erzeugt nahtlose Loops (MP4 + GIF) aus einer Hero-Szene; die Engine hat dafür einen Loop-Modus (`"loop": Sekunden`). Geprüft: Bild bei t und t+5 s unterscheidet sich nur um das Filmkorn (mittlere Abweichung 0,95 im statischen Test). Der Loop ist ruhig bewegt: Kamera-Orbit, schwebende und wippende Geräte, laufendes Bodengitter, wandernde Lichter (`MOTION=` skaliert die Stärke, Standard 0,6; Screen-Scrollen nur auf Wunsch mit `SCROLL=520`, Standard aus). Nahtlosigkeit gemessen: Schritt letztes→erstes Bild 5,96 gegenüber 6,50 typischem Bild-zu-Bild-Schritt. Beispiel: `promo-kit/loops/devices-16x9.{mp4,gif}` (1280 px, 5 s).
- **Geprüft:** `tools/setup.sh` mit Smoke-Test ✅, Testrender (120 Bilder → mp4) ✅, Soundtrack-Lauf (60,0 s) ✅, Kontaktbögen aller Key-Visuals gesichtet ✅. **Nicht geprüft:** vollständiger 60-s-Render mit dem Kit (die Vorgänger-Pipeline lief komplett).

### Docs – Promo-Demo, Agent-Skills und Doku-Linkprüfung (nach B-62)

Kein Produktcode geändert; Versionen unverändert, nur die Build-Nummer wurde aktualisiert.

- **Promo-Demo (Test):** `promo/GrowObserver-Promo.mp4` – 44 s, 1920×1080 @ 30 fps, 10 Szenen als Motion Graphics mit echten Mock-Screenshots und App-Icon, selbst synthetisierter Soundtrack (120 BPM).
  Die Szene ist eine HTML-Datei (`promo/scene.html`), gerendert Bild für Bild mit Playwright, dann ffmpeg. Komplette Pipeline: `bash promo/build.sh`. Alle Zahlen und Inhalte im Video stammen aus Demo-Daten; die KI-Szene zeigt nur die Oberfläche.
- **`promo/PROMODEMO.md`:** ausführliche Dokumentation (Englisch): Storyboard, Szenen-Interna, Musik, Neuaufbau, Ressourcen, Hinweise zur Ehrlichkeit, Fehlersuche.
- **Skills (Englisch):** `.claude/skills/{doc-create,doc-maintain,version-bump}/SKILL.md` (projektspezifisch) und generische Kopien unter `docs/skills/`.
- **`npm run docs:check`:** neues Skript `scripts/check-doc-links.mjs` prüft relative Links und Pfade in den lebenden Docs (Archiv, Changelog und Progress ausgenommen).
- **Doc-Map:** `CLAUDE.md` §5, `README.md` und `HANDOFF.md` §2 kennen `promo/`, die Skills und das Prüfskript.
- **Geprüft:** `npm run docs:check` ✅ (inkl. Negativtest mit absichtlich kaputtem Link), `npm run version:check` ✅, `version.test.ts` ✅, `bash promo/build.sh` einmal komplett neu gelaufen ✅ (Video reproduzierbar). **Nicht geprüft:** Frontend-/API-/E2E-Suiten (kein Code geändert).

### Docs – Dokumentations-Umbau (nach B-62)

Reine Dokumentationsaufgabe, kein Code geändert; Versionen unverändert, nur die Build-Nummer wurde aktualisiert.

- **Struktur:** Im Wurzelverzeichnis bleiben die Dateien, die Agenten und Einsteiger brauchen (`README`, `CLAUDE`, `DESIGN`, `TODO`, `PLAN`, `HANDOFF`, `ARCHITECTURE`);
  `CHANGELOG`, `TESTING` und `MILESTONES` liegen in `docs/`, Altbestände in `docs/archive/` (`MIGRATION`, `HANDOFF-bis-B62`, `TODO-bis-B62`, `PROGRESS-bis-B62`).
- **Eine Quelle je Fakt:** Endpunkte, Umgebungsvariablen und Betrieb nur in `apps/api/README.md`; Architektur in `ARCHITECTURE.md`; Testzahlen in `docs/TESTING.md`; offene Punkte nur in `TODO.md`.
  `CLAUDE.md` enthält nur noch Regeln (inkl. Pflegeregeln für die Doku).
- **Sprachen:** Englisch: CLAUDE, DESIGN, HANDOFF, PLAN, TESTING, TODO, ARCHITECTURE. Deutsch: README, `apps/api/README`, CHANGELOG, MILESTONES.
- **`PROGRESS.md` → `docs/PROGRESS.md`:** nur noch die Build-Tabelle (eine Zeile je Aufgabe, ohne Signaturspalte); die doppelte Änderungs-Historie lebt hier im Changelog, das alte Protokoll ist archiviert. Die Ergebnisse je Aufgabe stehen zusätzlich als „Geprüft“-Zeilen in diesem Changelog (B-42 bis B-62).
- Alle Fakten wurden gegen den Code geprüft (u. a. Endpunktvertrag gegen `apps/api/src/routes/*`).

### B-62 – Echte 404-Seite und Sorten-Detail-URL (Arena Agent)

Versionen unverändert (Frontend v0.1.1, Backend v0.0.2); nur die Build-Nummer wurde aktualisiert.

- **Echte 404:** `app/[[...slug]]/page.tsx` ist jetzt eine Server-Komponente und prüft den Pfad mit `parsePath` (`src/lib/routes.ts`, einzige Quelle der Wahrheit). Unbekannte, zu tiefe oder unsichere
  Pfade (`/gibt-es-nicht`, `/grows/a/b`, `/profile/hacker`, `/auth`) antworten mit **HTTP 404** und `app/not-found.tsx` („Seite nicht gefunden“, Link „Zur Startseite“, `noindex`) – vorher zeigte die App
  stillschweigend das Dashboard und schrieb die Adresse auf `/` um. `/` bleibt statisch vorgerendert (`generateStaticParams`), `/api/*` ist unberührt (API-404 bleibt JSON).
- **404 in der App:** neue Ansicht `notFound` (`src/views/NotFound.tsx`, überarbeitet: ohne Demo-Inhalte). Sie erscheint, wenn die Adresse nicht lesbar ist (z. B. Zurück auf einen ungültigen Eintrag, Offline-Shell).
  Die falsche Adresse bleibt in der Adresszeile; „Zum Dashboard“ und „Zurück“ führen weg. Der Service Worker liefert für unbekannte Pfade weiterhin keine Shell (`isAppRoute`).
- **Sorten-Detail-URL:** `/strains/<id>` öffnet die Sorte direkt (Reload, Direktlink, Teilen). Öffnen legt einen History-Eintrag an, **Zurück schließt** das Detail. Unbekannte ID → Hinweis „Sorte nicht gefunden“
  und Rückfall auf `/strains`. Neuer Knopf „Link teilen“ im Detail (`shareOrCopy`).
- **Mitgenommen (Härtung):** `scripts/server.mjs` antwortet auf fehlerhafte Prozent-Kodierung (`/%E0%A4%A`) mit **400** statt 500 (Next brach mit 500 ab, auch unter `/api`).
- **Verhaltensänderung:** `/auth`, `/create`, `/dev-admin` sind weiterhin keine Adressen (nicht verlinkbar) – sie führen jetzt zu 404 statt zum Dashboard.
- **Tests:** Frontend 180 → 181 (`routes.test.ts` Strains-Detail + Sicherheitsfälle, `nav.test.tsx` 404-Ansicht ohne Adress-Umschreiben, `back()` zum Dashboard), E2E 34 → 37
  (`routing.spec.ts`: HTTP-Status je Pfad inkl. 400, Server-404 → Startseite, App-404 per `popstate`, Sorte öffnen/Reload/Teilen/Zurück/unbekannte ID). Der alte E2E „unbekannter Pfad → Dashboard“ entfiel.
- **Geprüft:** Typecheck ✅, Lint ✅, Next-Build ✅ (Vite-Build zuletzt bei B-61). **Nicht geprüft:** 404 im Vite-Legacy-Build (dort gibt es keine Pfade), 404-Seite hinter einem Reverse-Proxy mit eigener Fehlerseite, Offline-Verhalten von `/strains/<id>` im Service Worker (Regel vorhanden, nicht im Browser getestet).


### B-61 – Community-Moderation (Arena Agent)

Versionen unverändert (Frontend v0.1.1, Backend v0.0.2); nur die Build-Nummer wurde aktualisiert.

- **Feed je Community:** `posts.community_id` (Migration `0012_community_moderation.sql`). `GET /social/posts?communityId=…` und `POST /social/posts
  { communityId }` – nur **Mitglieder** lesen und schreiben (Außenstehende: 404 bzw. 403, auch bei privaten Communities ohne Existenzhinweis).
  Der **globale Feed** zeigt nur noch Beiträge ohne Community. Kommentare und Likes eines Community-Beitrags folgen derselben Regel. UI: Reiter
  **Feed · Mitglieder · Moderation** auf der Community-Seite; Nicht-Mitglieder sehen „Nur für Mitglieder“.
- **Ausblenden (reversibel):** `POST /communities/:id/posts/:postId/(hide|unhide)` und `…/comments/:commentId/(hide|unhide)` für **Moderatoren und Admins**.
  Ausgeblendete Beiträge/Kommentare sehen Mitglieder nicht (404 beim direkten Zugriff, nicht im Zähler); die Moderation sieht sie markiert und kann sie
  einblenden. Moderatoren fassen **Inhalte von Admins nicht an** (403). Der Autor wird benachrichtigt.
- **Rauswurf und Sperre:** `DELETE /communities/:id/members/:userId` (Browser: `?ban=true` statt Body). Moderatoren entfernen **Mitglieder**, Admins auch
  **Moderatoren**; Admins und man selbst nie (409/400). Beim Rauswurf **wählt die Moderation „Dauerhaft sperren“**. Gesperrte können weder öffentlich noch per
  Code beitreten (403, die Einladung wird nicht verbraucht). `GET /communities/:id/bans` und `DELETE …/bans/:userId` (**nur Admins**). Betroffene werden benachrichtigt.
- **Rollen:** Moderatoren ernennen/entfernen weiterhin niemanden – das bleibt **Admin-Sache** (unverändert, jetzt per Test belegt).
- **Meldungen:** `POST /communities/:id/reports { kind, targetId, reason, details? }` – jedes Mitglied, fremde sichtbare Inhalte der eigenen Community, **eine Meldung je Person
  und Inhalt** (doppelt = 200 `duplicate`), Gründe `spam | harassment | illegal | offtopic | other`, 20/Stunde. **Warteschlange** `GET …/reports?status=open|closed`
  (nur Moderation) gruppiert nach Inhalt mit Vorschau und allen Gründen; `POST …/reports/resolve { kind, targetId, action: hide|dismiss }` entscheidet alle offenen Meldungen
  zu einem Inhalt („Ausblenden & erledigen“ bzw. „Kein Verstoß“). Offene Meldungen erscheinen als Zähler am Reiter „Moderation“ (`openReports` im Detail, nur Moderation).
- **Datenschutz/Aufräumen:** Community-Beiträge erscheinen **nicht** in der Betreiber-Inhaltsliste (`/admin/content`); das Admin-Löschen eines Beitrags entfernt jetzt auch dessen
  Kommentare und Meldungen (zuvor blieben Kommentare verwaist). Kommentarzähler zählen nur sichtbare Kommentare.
- **Nicht enthalten (bewusst):** Meldungen/Ausblenden für den globalen Feed und das Forum (bleiben beim Admin-Löschen); Austreten aus einer Community; Einspruch gegen Moderation.
- **Mock-Modus:** gleiche Regeln im Session-Speicher (`src/services/mock.ts`).
- **Tests:** API 139 → 155 (`moderation.integration.test.ts`: Feed-Zugriff, Ausblenden/Kommentare, Admin-Schutz, Meldungen/Queue/Entscheidung/Limit, Rauswurf-Rechte, Sperre per Beitritt/Code,
  Entsperren, Aufräumen; Migration 0012), Frontend 169 → 180 (`moderation.test.tsx` 8, `mock-moderation.test.ts` 3), E2E 31 → 34 (`moderation.spec.ts`: Feed → Melden → Queue → Ausblenden mit
  Benachrichtigung; Kommentar melden/ausblenden und Außenstehende; Rauswurf mit Sperre/Entsperren). Zusätzlich behoben: ein Typfehler im B-59-Test (`tsconfig.tools.json`).
- **Geprüft:** Typecheck ✅ (inkl. `apps/api`-Build und `tsconfig.tools.json`), Lint ✅. **Nicht geprüft:** mobile Ansicht der neuen Reiter im echten Browser, große Warteschlangen (Paginierung fehlt: höchstens 100 Inhalte), Zusammenspiel mit Echtzeit (der Feed lädt nicht live nach).


### B-60 – Rate-Limit über mehrere Instanzen (Arena Agent)

Versionen unverändert (Frontend v0.1.1, Backend v0.0.2); nur die Build-Nummer wurde aktualisiert.

- **Gemeinsamer Zähler in PostgreSQL:** neue Tabelle `rate_limits` (Migration `0011_rate_limits.sql`, `UNLOGGED`: schnell, bei Absturz zurückgesetzt).
  Je Anfrage **ein atomarer Upsert** (`INSERT … ON CONFLICT DO UPDATE`) für alle Schlüssel gemeinsam; Fenster und Ablauf zählen nach
  Datenbankzeit, damit Instanzen übereinstimmen. Kein Redis nötig; Verhalten und Grenzwerte (Login, Register, Passwort, Upload, Chat, Echtzeit) unverändert.
- **Datenschutz:** Schlüssel werden als SHA-256-Hash gespeichert – keine Klartext-E-Mail oder IP in der Datenbank. Abgelaufene Zeilen räumt jede Instanz
  höchstens einmal pro Minute im Hintergrund auf.
- **Ausfallverhalten:** Ist die Datenbank oder die Tabelle nicht erreichbar, zählt der Prozess ersatzweise im Speicher (Limit gilt weiter, keine 500)
  und schreibt höchstens einmal pro Minute eine Warnung ins Log.
- **Geändert:** alle Schlüssel einer Anfrage werden gezählt, auch wenn ein anderer schon blockiert (Angreifer mit wechselnden IPs verbrauchen so das
  E-Mail-Limit weiter). `resetRateLimits()` ist jetzt `async` (leert auch die Tabelle).
- **Gemessen:** zwei echte API-Prozesse (`apps/api/dist`, Ports 4010/4011) gegen dieselbe Datenbank: 12 abwechselnde Login-Versuche → 10× 401, danach
  11. und 12. = 429 (auf beiden Prozessen).
- **Tests:** API 130 → 139 (`rate-limit.test.ts`: 25 parallele Treffer → genau 10 erlaubt, zwei getrennte Modulinstanzen teilen den Zähler, neues Fenster,
  alle Schlüssel gezählt, nur Hashes gespeichert, Datenbankausfall → Ersatzzähler, Aufräumen, API-Limits laufen über die Tabelle; Migration 0011).
- **Geprüft:** Typecheck ✅, Lint ✅, Frontend 169/169 ✅, E2E 31/31 ✅.


### B-59 – Chat- und Echtzeitsystem (Arena Agent)

Versionen unverändert (Frontend v0.1.1, Backend v0.0.2); nur die Build-Nummer wurde aktualisiert.

- **Echtzeit-Kanal:** WebSocket (`/api/realtime/ws`) mit Rückfall auf **Server-Sent Events** (`GET /realtime/stream` + `POST /realtime/command`)
  und zuletzt **Polling** (alle 8 s, nur bei sichtbarem Tab). Der Client (`src/lib/realtime.ts`) wechselt selbstständig die Stufe, verbindet
  mit Backoff + Jitter neu, pausiert nach 60 s im Hintergrund, baut bei Netzwechsel neu auf und erkennt tote Verbindungen (75 s Stille).
- **Mehrere Instanzen ohne Redis:** der Hub (`apps/api/src/realtime/hub.ts`) verteilt Ereignisse per **PostgreSQL `LISTEN/NOTIFY`**.
  Ereignisse sind klein (nur IDs, < 7,5 KB); Inhalte lädt der Client über die normale, autorisierte REST-API nach. Nach einem Verbindungsabbruch
  des Listeners erhalten alle Clients `resync`.
- **Sicherheit:** WebSocket-Anmeldung per HttpOnly-Cookie; ohne Cookie (Sandbox-Proxy) **nur mit `ALLOW_HEADER_SESSION`** per erster
  Nachricht `{type:"auth"}` innerhalb von 5 s. **Origin-Prüfung** gegen Cross-Site-WebSocket-Hijacking, Nachrichtengröße 4 KB, höchstens
  5 Verbindungen je Konto, Konten mit offenem Passwortwechsel werden abgewiesen. Der Herzschlag (25 s) prüft die Sitzung: Abmelden, „Alle
  Geräte“ oder Passwortwechsel **trennen laufende Verbindungen** (Code 4401). Themen sind auf `thread:<uuid>` beschränkt (max. 20).
- **Chat (Kern):** `POST /chat` (Direktnachricht starten/öffnen, idempotent: ein Chat je Paar über `direct_key`), `GET /chat/users?q=` (Suche, ≥ 2
  Zeichen), `POST /chat/:id/read` (Leseposition je Mitglied), `GET /chat/unread`, echte `unread`-Zähler, Gegenstelle als Name/Avatar der
  Konversation, `createdAt` an Nachrichten, Senden begrenzt (90/min). Eine leere Direktnachricht erscheint beim Gegenüber erst mit der ersten
  Nachricht. UI: „Neue Nachricht“, Badge in Seitenleiste und „Mehr“-Menü, Live-Anzeige im Chat.
- **Tippanzeige und Online-Status:** `chat.typing` (Client höchstens alle 3 s, Server 1 je 2 s und Person/Chat, nur für Mitglieder; klingt nach 5 s
  ab), `presence` nur für Gesprächspartner (Herzschlag verlängert `users.online_until` um 70 s; 8 s Karenz beim Trennen). Offen: keine Option, den
  Online-Status zu verbergen.
- **Weitere Live-Ereignisse:** `notification` (neu: Forum-Antworten benachrichtigen Thread- bzw. Kommentar-Autor, nie sich selbst) und
  `thread.comment` (offene Threads laden neue Kommentare live nach).
- **Migration `0010_chat_realtime.sql`:** `conversation_members.last_read_at` (bestehender Verlauf gilt nicht als ungelesen), `conversations.created_by`,
  `conversations.direct_key` (eindeutig, nur wenn gesetzt), `users.online_until`, Indizes für Nachrichten/Mitglieder.
- **Betrieb – Serverskript ersetzt `next start`:** Next-Route-Handler können keine WebSocket-Upgrades annehmen. `scripts/server.mjs`
  (`npm start`, `npm run preview`, Playwright) startet Next im selben Prozess und leitet Upgrades an den Hub. Ohne dieses Skript
  (Serverless, `next dev`) läuft alles über SSE. Der eigenständige API-Server hängt `ws` direkt an. Reverse-Proxy: `Upgrade`/`Connection`-Header
  und keine Pufferung für `/realtime/stream` zulassen (siehe `apps/api/README.md`). Neue Abhängigkeit: `ws`.
- **Gemessen im Vorschau-Proxy:** SSE und WebSocket (mit Token als erste Nachricht) kommen durch; Nachricht → Ereignis in ~60–250 ms. Auch der
  eigenständige API-Build (`dist/`) wurde real mit WebSocket und SSE geprüft.
- **Tests:** Frontend 135 → 169 (Client mit Fallback/Backoff/Stille/Themen, Provider/Polling, Chat-Hooks, „Neue Nachricht“), API 108 → 130
  (`realtime.integration.test.ts`: Hub, Themen, SSE, WebSocket inkl. Origin/Token/Sitzungsende/Limit, Chat-API, Tippen, Online, Forum-Benachrichtigung;
  Migration 0010), E2E 28 → 31 (`realtime.spec.ts`: WebSocket-Chat mit Badge/„schreibt …“/Online, SSE-Rückfall, Forum live + Glocke).
- **Geprüft:** Typecheck ✅, Lint ✅. **Real geprüft:** `.archive/diag/realtime-smoke.mjs` gegen den Produktionsserver lokal, durch den Sandbox-Vorschau-Proxy (WebSocket mit Token-Erstnachricht und SSE) und gegen den eigenständigen `apps/api/dist` (beide Transporte). **Nicht geprüft:** Verhalten hinter nginx/Traefik, Multi-Instanz-Betrieb mit zwei echten Prozessen (die Zustellung läuft über dieselbe NOTIFY-Kette, die die Tests abdecken), echte Mobilgeräte (Hintergrund-/Netzwechsel nur per Unit-Test).


### B-58 – Erzwungener Passwortwechsel nach Einmalpasswort (Arena Agent)

Versionen unverändert (Frontend v0.1.1, Backend v0.0.2); nur die Build-Nummer wurde aktualisiert.

- **Neue Spalte `users.must_change_password`** (Migration `0009_must_change_password.sql`, Standard `false`). `admin:create` setzt sie
  für **neu angelegte** Betreiber-Konten; `--promote` setzt sie **nicht** (das Passwort des Kontos bleibt ja).
- **Server erzwingt es:** `requireAuth` antwortet für solche Konten mit **403** `{ code: "password_change_required" }`. Erlaubt sind nur
  `GET /auth/me`, `POST /auth/password` und `POST /auth/logout-all` (plus `POST /auth/logout`). Öffentliche Routen (`optionalAuth`)
  behandeln das Konto als anonym. `POST /auth/password` hebt die Sperre auf (neues Passwort muss sich vom alten unterscheiden).
  `GET /auth/me` und die Anmeldeantwort enthalten `mustChangePassword`.
- **UI:** Vollbild-Sperre „Neues Passwort festlegen“ (`ForcedPasswordChange`) statt der App, unabhängig von der URL (auch tiefe Links);
  mit „Abmelden“. Nach dem Wechsel öffnet sich die App am gewünschten Ziel.
- **Neu: `admin:create --reset-password`** für ausgesperrte Betreiber: neues Einmalpasswort (einmalig angezeigt), Wechsel erzwungen, alle
  Sitzungen enden, Ereignis `password_changed` (Gerät „Betreiber-CLI“). Gilt nur für vorhandene Betreiber (sonst Fehler mit Hinweis).
- **Tests:** API 90 → 108 (`password-enforcement.integration.test.ts`, erweiterte `operator.integration.test.ts`, Migration 0009),
  Frontend 134 → 135, E2E 26 → 28 (`forced-password.spec.ts`; das Einmalpasswort-Konto wird dort per SQL-Flag simuliert, die CLI deckt
  der API-Test ab). CLI zusätzlich real gegen `dist/` geprüft (reset ohne Konto, neu, reset, reset bei Mitglied).
- **Geprüft:** Typecheck ✅ (Frontend + `apps/api`-Build/`tsconfig.tools.json`), Lint ✅. **Nicht ausgeführt:** Docker-Service `admin`.


### B-57 – URL-Routing (Arena Agent)

Versionen unverändert (Frontend v0.1.1, Backend v0.0.2); nur die Build-Nummer wurde aktualisiert.

- **Die Adresszeile folgt der Ansicht** (nur Next.js): `/grows/<id>`, `/forum/<threadId>`, `/wiki/<id>`, `/breeders/<id>`,
  `/communities/<id>`, `/profile/settings`, `/hall-of-fame` usw. Reload bleibt auf der Ansicht (vorher: immer Dashboard), Links sind
  teilbar. Schema und Regeln: `src/lib/routes.ts` (reine Funktionen). IDs müssen `[A-Za-z0-9_-]{1,64}` sein, sonst Listenansicht.
- **Browser-History:** `src/lib/nav.tsx` nutzt `pushState`/`popstate`. Zurück/Vorwärts-Taste und Wischgeste gehen durch die
  Ansichten. Die App-Zurück-Taste funktioniert auch bei direkt geöffneten Links (Detail → Liste → Dashboard). Neue Funktion
  `replaceParams` (Profil-Tab ohne neuen History-Eintrag).
- **Nicht verlinkbar:** Anmeldung, Dev-Admin, Erstellen-Assistent (URL bleibt `/`; Reload dort → Dashboard).
  Unbekannte Pfade → Dashboard (Adresse wird auf `/` bereinigt). Alte `?view=`-Links werden zum Pfad umgeschrieben (Hash bleibt).
- **Tiefer Link im abgemeldeten Zustand:** Anmeldung, danach öffnet sich das gemerkte Ziel (`Auth.tsx` navigiert nur noch von
  der Anmeldeseite selbst zum Dashboard).
- **Next:** `app/page.tsx` → `app/[[...slug]]/page.tsx` (optionale Catch-All-Route, dynamisch gerendert; `/api/*` bleibt
  unberührt). **Service Worker:** Navigationen zu App-Routen laufen über die Shell-Strategie (offline: gecachte „/“-Shell); ein
  Test hält die Segmentliste in `public/sw-policy.js` mit `routes.ts` synchron.
- **Teilen-Links** (Forum-Thread, Feed-Post, Hall of Fame) erzeugen Pfad-Links (`shareUrl`). Manifest-Shortcuts bleiben `?view=`.
- **Vite-Legacy-Build** unverändert: Adresse bleibt `/?view=…` (`config.pathRouting` nur unter Next), History-Einträge gibt es auch dort.
- **Tests:** Frontend 116 → 134 (`routes.test.ts`, `nav.test.tsx`, SW-Policy), E2E 20 → 26 (`e2e/routing.spec.ts`). Zwei
  Session-Tests mussten angepasst werden, weil ein Reload auf `/profile` jetzt auf dem Profil bleibt.
- **Geprüft:** Typecheck ✅, Lint ✅, Next-Build ✅. **Nicht geprüft:** Vite-Legacy-Build im Browser, PWA offline auf Deep-Links.


### B-56 – Betreiber-Bootstrap per CLI (Arena Agent)

Versionen unverändert (Frontend v0.1.1, Backend v0.0.2); nur die Build-Nummer wurde aktualisiert.

- **Neu: `npm run admin:create -- --email … [--name …] [--promote]`** (`apps/api/src/cli/admin-create.ts`, Logik in
  `src/lib/operator.ts`, kompiliert nach `dist/cli/admin-create.js`). Legt den ersten `platform_admin` an – ohne Demo-Daten,
  nur durch bewussten Aufruf. Docker: `docker compose --profile tools run --rm admin --email …`.
- **Passwort:** Für ein neues Konto wird ein **Zufallspasswort** (24 Zeichen, 144 Bit) erzeugt und **einmal** angezeigt; es gibt
  bewusst **keine `--password`-Option** (Shell-History). Nach der ersten Anmeldung im Profil ändern (B-55).
- **Bestehendes Konto:** nur mit `--promote`; das Passwort bleibt, **alle Sitzungen des Kontos werden beendet**. Ohne `--promote`
  Abbruch mit Hinweis. Vorhandener Betreiber → unverändert (idempotent).
- **Protokoll:** neues Ereignis `role_changed` (Gerät „Betreiber-CLI“) im Anmeldeprotokoll; kein Passwort wird protokolliert.
- Der Demo-Seed (`ALLOW_DEMO_SEED`) bleibt unverändert und nur für Entwicklung.
- **Tests:** API 83 → 90 (`operator.integration.test.ts`); CLI zusätzlich gegen eine echte Datenbank über `dist/` geprüft
  (ohne Migration, ohne Argumente, `--password` abgelehnt, neu, idempotent, bestehend ohne/mit `--promote`). Dabei fiel ein
  Typfehler auf, den nur `tsc -p apps/api` findet (behoben).
- **Geprüft:** Typecheck ✅ (Frontend + `apps/api`), Lint ✅, Frontend 116/116 ✅, E2E 20/20 ✅. **Nicht ausgeführt:** Docker-Service `admin` (Docker fehlt).


### B-55 – Passwort ändern, Anmeldeprotokoll, Gerätelimit (Arena Agent)

Versionen unverändert (Frontend v0.1.1, Backend v0.0.2); nur die Build-Nummer wurde aktualisiert.

- **Neu: `POST /auth/password`** `{ currentPassword, newPassword }` (neu: 12–128 Zeichen, muss sich vom aktuellen
  unterscheiden). Verlangt das **aktuelle Passwort**, beendet **alle anderen Sitzungen** (die aktuelle bleibt) und antwortet
  `204`. Falsches aktuelles Passwort → **403** (bewusst nicht 401: das würde im Client „Sitzung abgelaufen“ auslösen).
  Rate-Limit 5 Versuche / 15 min je Nutzer.
- **Neu: Anmeldeprotokoll** (Tabelle `login_events`, Migration `0008_login_events.sql`, Kaskade beim Löschen des Nutzers).
  Ereignisse `login`, `login_failed`, `register`, `password_changed` mit Zeit und Gerätebezeichnung – **keine IP-Adresse**
  (Datensparsamkeit). Fehlversuche werden nur für **existierende** Konten gespeichert (keine fremden E-Mail-Adressen).
  Aufbewahrung **90 Tage**: Einträge werden beim Schreiben des nächsten Ereignisses gelöscht und nie ausgeliefert.
  `GET /auth/login-history` liefert nur eigene Einträge (max. 50, neueste zuerst; Felder `id`, `event`, `device`, `createdAt`).
- **Neu: Gerätelimit** `MAX_SESSIONS_PER_USER = 5` (`apps/api/src/lib/session.ts`): Bei der 6. Anmeldung endet die am
  längsten inaktive Sitzung (Sortierung nach `lastSeenAt`).
- **UI:** Profil → Einstellungen: „Passwort ändern“ (aktuell, neu, Wiederholung; Client-Prüfung vor dem Senden),
  „Sitzungen & Geräte“ (lädt nach der Änderung neu) und „Anmeldeprotokoll“ (`src/components/AccountSecurity.tsx`). Alles
  nur im API-Modus; funktioniert auch mit dem Header-Fallback der Vorschau.
- **Tests:** API 68 → 83 (`password.integration.test.ts`, Migration 0008), Frontend 110 → 116
  (`AccountSecurity.test.tsx`), E2E 19 → 20 (Passwort ändern mit zwei Geräten).
- **Geprüft:** Typecheck ✅, Lint ✅.


### B-54 – Session-Härtung: HttpOnly-Cookie, serverseitiger Widerruf, Geräteliste (Arena Agent)

Versionen unverändert (Frontend v0.1.1, Backend v0.0.2); nur die Build-Nummer wurde aktualisiert.

- **Breaking (Auth-Transport):** Das Sitzungs-Token liegt nur noch in einem **HttpOnly-Cookie** `go_session`
  (`SameSite=Lax`, `Path=/`, `Secure` bei HTTPS/`X-Forwarded-Proto`). Es steht nicht mehr im JSON-Body, nicht im
  `localStorage` und wird nicht als `Authorization: Bearer` akzeptiert. Der Browser speichert nur einen **nicht geheimen
  Marker** (`go-session:api:<url>` = `1`) für den Tab-Sync. Alte Bearer-JWTs aus dem Speicher werden beim Start gelöscht,
  bestehende Nutzer müssen sich **einmal neu anmelden**.
- **Neu: Tabelle `sessions`** (Migration `0007_sessions.sql`): Jede Anmeldung ist eine Zeile; das JWT trägt nur die
  Sitzungs-ID (`sid`). Jede Anfrage prüft Signatur → Sitzung nicht abgelaufen/nicht gelöscht → aktuelle Rolle.
- **Neu: Endpunkte** `POST /auth/logout` (idempotent), `POST /auth/logout-all`, `GET /auth/sessions` (Gerätebezeichnung wie
  „Chrome auf Windows“, kein roher User-Agent, keine IP), `DELETE /auth/sessions/:id`. `login`/`register` nehmen
  `remember` (Standard `true`; `false` = Session-Cookie, serverseitig höchstens 12 h).
- **`JWT_TTL`** bedeutet jetzt „maximale Sitzungsdauer“, Standard **30d** (vorher 1 h ohne Verlängerung). Das ist sicher,
  weil Sitzungen widerrufbar sind.
- **CSRF:** neue Middleware `csrfGuard` – zustandsändernde Browser-Requests müssen `same-origin` sein oder von einem Origin
  aus `CORS_ORIGINS` kommen (`Sec-Fetch-Site`/`Origin`); CORS sendet jetzt `Allow-Credentials` nur für diese Origins.
- **UI:** Profil → Einstellungen → „Sitzungen & Geräte“ (Liste, einzeln beenden, „Auf allen Geräten abmelden“). Eine
  serverseitig beendete Sitzung meldet das Gerät bei der nächsten Anfrage automatisch ab (Event `go:session-expired`).
- `scripts/smoke-live.sh` nutzt einen Cookie-Jar. Entwickler-Hinweis: API-Clients außerhalb des Browsers lesen das Cookie aus
  `Set-Cookie`.
- **Fix (B-54.1, gemeldet: „nach Registrierung keine Anmeldung möglich“):** Die Preview läuft in einem iframe unter fremder
  Domain; dort verwirft der Browser `SameSite=Lax`-Cookies. Neu: `COOKIE_SAMESITE=lax|none` (Standard `lax`). `none` setzt
  `Secure; SameSite=None; Partitioned` (nur für iframe-Einbettung); `scripts/preview.sh` setzt es standardmäßig auf `none`.
  Der CSRF-Guard bleibt aktiv.
- **Fix (B-54.2, Ursache des gemeldeten Login-Problems):** Der Sandbox-Proxy der Vorschau (`*.arena.site`) reicht weder
  `Cookie` noch `Authorization` an die App durch (per Echo-Server nachgewiesen; eigene Header kommen an). Deshalb gab es
  nach der Registrierung nur 401. Neu: **`ALLOW_HEADER_SESSION=true`** (Standard `false`) – Login/Registrierung liefern dann
  zusätzlich `token`, der Client sendet es als `X-Session-Token`, der Server akzeptiert den Header (Sitzung bleibt in der
  DB widerrufbar). `scripts/preview.sh` schaltet das für die Vorschau ein; **Produktion bleibt Cookie-only**. Der Fallback
  ist für JavaScript lesbar (schwächer als HttpOnly) und gehört nicht in echte Deployments.
  Geprüft durch den echten Proxy mit Firefox und Chromium im eingebetteten iframe (Registrieren + Reload ✅).
- **Tests (Endstand B-54):** Frontend 110, API 68 (+32, neu `sessions.integration.test.ts`: Cookie-Flags lax/none, Widerruf, Ablauf, fremde `sid`, Geräteliste, CSRF, CORS-Credentials, Header-Fallback an/aus; Migration 0007), E2E 19 (+6, neu `session.spec.ts`; die E2E-Suite läuft mit `RATE_LIMIT_DISABLED=true`, weil sie mehr als 10 Konten pro Stunde registriert).
- **Geprüft:** Typecheck ✅, Lint ✅, Next-Build ✅, Vite-Build ✅.


### B-53 – Keine Demo-Daten im API-Modus (Arena Agent)

Regel: **Demo-Daten nur im Mock-Modus** (`NEXT_PUBLIC_API_URL` leer). Im API-Modus zeigen die Views echte Daten oder
ehrliche Leerzustände. Build-Nummer wurde aktualisiert, Versionen unverändert (Frontend v0.1.1, Backend v0.0.2).

- **Dashboard:** echte Kennzahlen (Aktive Grows, Offene Tasks, Ø Gesundheit), Klimakarte aus dem letzten Messpunkt oder
  „Noch keine Klimadaten“, Leerzustände für Grow/Tasks/Aktivität/Angebote; KI-Banner, Kosten-Karte und erfundene
  Community-Zahlen nur im Mock-Modus.
- **Avatar:** neuer Fallback (Initialen im namensabhängig gefärbten Kreis, Icon ohne Namen) wenn `src` fehlt oder das Bild
  nicht lädt; `name`-Prop an allen relevanten Aufrufstellen.
- **Auth:** Hero-Zahlen und „12.400 Grower vertrauen…“ nur im Mock-Modus; Passwort-Hinweis „Mindestens 12 Zeichen.“,
  `autoComplete` je Modus.
- **Strains** (Bewertungen), **Verbrauch** (komplette Seite), **Wiki** (Mitwirkende/Commits), **Social** (Stories,
  Vorschläge; Trending-Tags aus echten Posts berechnet), **KI-Assistent** (Hinweis „KI noch nicht angebunden“,
  Eingabe gesperrt, keine Nutzungszahlen, Rezepte → Leerzustand): Demo-Inhalt nur im Mock-Modus.
- Unverändert (Referenzinhalt): Rechner, Simulation, Design-System-Galerie.
- Tests: Frontend 98 (+7, `src/components/ui.test.tsx`), API 36, E2E 12 desktop + 1 mobil (das `test.fixme` ist jetzt ein
  grüner Test; +4 neue).
- **Geprüft:** Typecheck ✅, Lint ✅, Next-Build ✅.


### B-52 – Zentrale Versionierung, Preview (Arena Agent)

- **Neu:** `version.json` als einzige Versionsquelle: Frontend-Codename „Ruderalis“ + **v0.1.1**, Backend **v0.0.2**,
  Build-Nummer `YYMMDDHH` (Europe/Berlin), `modules` als Vorbereitung für Modul-Versionen. Vom Eigner vorgegeben.
- **Neu:** `scripts/version.mjs` (`version:sync|check|build|show`), generierte `apps/api/src/version.generated.ts`,
  CI-Check, Vitest-Prüfung; Anzeige im Login-Footer, in Einstellungen/Dev-Admin; `GET /api/version` mit Frontend + Backend,
  Standalone-API `GET /version`. Update-Erkennung (Build-ID) unverändert.
- **Neu:** `npm run preview` (`scripts/preview.sh`) – Preview ist jederzeit startbar.
- `package.json`: 0.50.0 → 0.1.1, `apps/api/package.json`: 0.1.0 → 0.0.2 (Vorgabe des Eigners; frühere 0.x-Zählung ist historisch).
- Tests: Frontend 91 (+5), API 36 (+2), E2E 8 + 1 fixme (+1).
- **Geprüft:** Typecheck ✅, Lint ✅, API-Typecheck + `tsconfig.tools.json` ✅, Next-Build ✅, Vite-Build ✅.


## Vor dem Versions-Neustart (B-51 und älter)

Historische Zählung (`v0.x`, B-Nummern); Einträge bleiben inhaltlich unverändert, ältere tragen die Signatur ihres damaligen Agenten.

### B-51 – Härtung: Rate-Limits, JWT-Pflicht, Build-Fix (Arena Agent)

- **Fix:** `src/assets/hero.jpg` war in `2a81529` gelöscht, wird aber von Auth/Onboarding importiert →
  Next- und Vite-Build waren rot. Datei wiederhergestellt.
- **Neu:** In-Memory-Rate-Limiter (`apps/api/src/middleware/rate-limit.ts`): Login 10 / 15 min pro IP **und**
  pro E-Mail, Registrierung 10 / h pro IP, `POST /media` und `/upload/presign` 30 / 10 min pro Nutzer.
  Antwort `429` + `Retry-After`. Client-IP = letzter `X-Forwarded-For`-Eintrag (`TRUST_PROXY=false`
  ignoriert Forwarded-Header; `RATE_LIMIT_DISABLED=true` schaltet ab – nur für Tests/Debug).
- **Neu:** Embedded-API bricht in Produktion ohne `JWT_SECRET` ab (503 + Log) statt ein flüchtiges
  Secret zu erzeugen. Bewusster Opt-out: `ALLOW_EPHEMERAL_JWT_SECRET=true`.
- **Repo:** Root-`package-lock.json` eingecheckt; `.archive/` und Sandbox-Ordner aus Git/ESLint ausgenommen.
- **Neu:** Browser-E2E mit Playwright (`npm run test:e2e`, `e2e/`, CI-Job `e2e`): Konto/Session, Grow, Forum, Deep-Link, Mobile.
- **Fix (per E2E gefunden):** Forum-Bereiche fehlten auf Datenbanken ohne Demo-Seed → Thread-Erstellung 404.
  Migration `0006_default_forum_subs.sql` (idempotent), Seed angepasst.
- **Bekannt:** Dashboard zeigt im API-Modus statische Demo-Daten (`test.fixme`), Avatar-Fallback zeigt Alt-Text.
- Tests: API 34/34 (+10), Frontend 86/86 (+4), E2E 7 + 1 fixme (Baseline vor B-51: 82 bzw. 24 bzw. 0).
- **Geprüft (Node 22.23, PostgreSQL 17):** `npx next typegen` ✅, Typecheck ✅, Lint ✅, `npm run check:peers` ✅, Next-Build ✅, Vite-Build ✅ (964,33 kB / 341,18 kB gzip); auf einer frischen DB 6 Forum-Bereiche über Migration 0006 bestätigt. Baseline vor B-51: beide Builds rot (fehlende `src/assets/hero.jpg`). Zahlen älterer Einträge (52/52, 76/76 …) sind historisch.


### B-50 – App-Updates (Claude / Anthropic)

- **Neu:** App erkennt neue Versionen (Build-ID vs. `/api/version`) und aktualisiert je nach Einstellung
  automatisch, per Banner oder manuell; „Was ist neu“ nach Updates.
- **Neu:** Developer-Admin „Updates“: Release-Notes mit Dringlichkeit, Features hervorheben und
  gleichzeitig freischalten, Pflicht-Updates.
- Migration `0005_app_releases.sql`; Version 0.50.0.
- **Geprüft:** API 24/24 (Releases: nur Admin, Validierung, öffentliche Reihenfolge, Löschen). Update-Logik per Unit-Test (verfügbar/Pflicht/ungesehen/Einstellungen/Auto-Anwenden). Zwei aufeinanderfolgende Produktions-Builds: Build-ID im Client entspricht `/api/version`, ein neuer Build meldet eine andere ID.


### B-49 – Globale Feature-Flags + echtes Aktualisieren (Claude / Anthropic)

- **Fix:** Im Dev-Admin deaktivierte Features gelten jetzt für alle Nutzer und Geräte (vorher nur im
  Browser des Admins). Server speichert die Flags (`feature_flags`) und sperrt deaktivierte APIs (403).
- **Fix:** Pull-to-Refresh lädt Daten, Flags und Profil tatsächlich neu und erkennt App-Updates.
- Migration `0004_feature_flags.sql`; Paritätstest Frontend ↔ API; Tests API 23/23, Frontend 76/76.
- **Geprüft:** API-Tests (Nicht-Admin 403, Kern-Feature 409, unbekannter Key 404, anderer Nutzer sieht Override, API-Route mit `feature` gesperrt, Reset). Live: Admin deaktiviert ein Feature → ein zweites Konto wird gesperrt.


### B-48 – UI/UX-Fixes (Claude / Anthropic)

- Slider verstellen sich beim Scrollen nicht mehr; neue Seitengesten (unten Tabs, Mitte zurück);
  Tab-Wischen in Developer-Admin und Profil.
- „Angemeldet bleiben“ funktioniert; Abmelden im Drawer/Sidebar; AGB-Zustimmung Pflicht.
- Glocke/Badges zeigen echte Zahlen; Benachrichtigungen führen zum Ziel.
- „App installieren“ funktioniert (Install-Prompt, iOS-Anleitung); Icons auf echte 192/512 px korrigiert.
- Forum: Votes (inkl. Zurücknehmen), Kommentar-Votes, Antworten. Kommentare für Hall of Fame und Social.
- Migration `0003_votes_item_comments.sql`; Tests API 22/22, Frontend 71/71.
- **Nicht geprüft:** echte Geräte (Slider vs. Scroll, Seitenwischzonen, Installations-Hinweis).


### B-47 – Foto-Uploads, Profil, Emoji, Teilen, Sammlung (Claude / Anthropic)

- **Uploads ohne S3:** Bilder in PostgreSQL (`/media`), Magic-Byte-Prüfung, Quote, sichere Auslieferung;
  Client verkleinert und entfernt EXIF. Genutzt für Social-Posts, Chat, Grow-Galerie und Avatar.
- **Profil bearbeiten** (Name, Titel, Avatar) über `PATCH /auth/me`.
- **Emoji-Auswahl** in Social und Chat; **Teilen/Link kopieren** kopiert jetzt wirklich (Share-Sheet).
- **Sortensammlung** mit Backend (`strain_collection`) und Filter „Meine Sammlung“.
- **Deep-Links** `/?view=…` (Allowlist). Migration `0002_media_collection.sql`.
- Tests: API 20/20, Frontend 64/64; Skript `npm run test:api:local`.
- **Geprüft:** Live-Check gegen die Vorschau (Upload → ausliefern → anhängen). Kamera-Upload auf echten Geräten ungeprüft.


### B-46 – Backend verbunden, dauerhafte Speicherung (Claude / Anthropic)

- **Neu:** Eingebettete Self-Host-API unter `/api/*` (`app/api/[...route]`), automatische Migrationen,
  API-Modus als Standard. Daten liegen in PostgreSQL und überleben Neustarts.
- **API:** `API_EMBEDDED`-Modus (Storage optional, Upload `503`), Standalone-Regeln unverändert;
  relative Imports auf `.ts` + `rewriteRelativeImportExtensions` (Turbopack-kompatibel).
- **Sandbox-DB** migriert und mit Demo-Inhalten befüllt.
- `/api/health` liefert zusätzlich `ok`/`check` und `dataMode: "api-embedded"`.
- **Geprüft:** echter `next start` gegen PostgreSQL: erster Request migriert (26 Tabellen); Registrieren → Task + Grow → Server-Neustart → Login → Daten noch da; 401 ohne Token; Upload-Presign 503 ohne Speicher. Alle 37 vom Frontend genutzten Endpunkte lieferten 2xx gegen die befüllte Sandbox-DB. Klick-Test im API-Modus stand aus (kein Headless-Browser).


### B-45 – Paket 3 + Backend-Routen (Claude / Anthropic)

- **API:** `POST /strains`, `POST /wiki`, `/tasks` (list/create/toggle, pro User isoliert);
  Migration `0001_tasks_authoring.sql`; +2 Integrationstests (15/15).
- **Frontend-Daten:** `useCurrentUser()`, Benachrichtigungen, Breeder-Katalog und Wiki-Kategorien über
  den Service-Layer statt Mock-Imports (API-Modus zeigt keine Demo-Personendaten mehr).
- **Typen:** Domänen-Typen nach `src/types/domain.ts` verschoben.
- **Performance:** Views per `React.lazy` + Idle-Prefetch der Bottom-Nav-Views.
- **Sicherheit:** `next` 16.3.6 (kritisch), `vite`, `postcss`, `vitest` aktualisiert → Frontend 0
  Advisories; API `drizzle-orm` 0.45.3 (SQL-Injection-Fix), `drizzle-kit` 0.31.11.
- **Tooling:** Root-`.npmrc` `legacy-peer-deps=true` (Workaround npm-10-Absturz bei vitest-Peers).
- **Geprüft:** API 15/15; Migrationspfad 0000 → 0001 mit Daten geprüft; `npm audit`: Frontend 0, API 4 moderat (drizzle-kit/esbuild, nur CLI); frisches `npm ci` aus dem neuen Lockfile ✅.


### B-44 – Gesten, Schnellaktionen, Galerie, Sortenvergleich (Claude / Anthropic)

- **Gesten:** Drawer, BottomSheet und Mobile-Modal lassen sich im gesamten Panel wegwischen
  (`src/lib/gestures.ts`); Toasts auf ganzer Fläche wischbar; Tab-Wischen für die Bottom-Nav mit
  Randzonen-Schutz gegen den Drawer-Edge-Swipe.
- **Schnellaktionen:** neue View `create` mit Formularen für Grow, Log-Eintrag, Sorte, Task und
  Wiki-Artikel (statt Demo-Toast). Neue Service-Methoden inkl. `TaskService`; Dashboard-Tasks laufen
  über den Service-Layer.
- **Galerie:** `SwipeLightbox` als Vollbild-Viewer (zentriert, Swipe, Zoom, Thumbnails, Tastatur).
- **Sortenvergleich:** funktioniert jetzt Ende-zu-Ende (Sorten → Vergleichsleiste → Planer).
- **Hall of Fame:** einheitliche Featured-Karte, keine Doppelung, kein Spaltenbruch.
- Tests: +9 (Gesten-Entscheidungen, Vergleichs-Toggle, Mock-Create-Flows).
- **Geprüft:** Vitest 61/61 (neu `gestures.test.ts`, `mock-create.test.ts`). Gestenverhalten (Touch, Scroll-Übergabe, Tab-Wischen vs. Edge-Swipe) braucht noch echte Geräte.


### B-43 – Aufräumen (Claude / Anthropic)

- **Entfernt:** `src/components/InlineIcon.tsx` (nie importiert), `pnpm-workspace.yaml` (npm-Projekt,
  `packages/` existierte nicht), `public/images/hero.jpg` (Duplikat von `src/assets/hero.jpg`, nur im
  SW-Cache referenziert), `checkBackend()` (durch `AdminService`/`healthRows` ersetzt),
  `simulationCurve` (Mock ohne Nutzer).
- **Bewusst behalten:** `Accordion`, `Divider`, `Tooltip`, `toneText/toneDot/toneColor` – in
  `DESIGN.md` dokumentierte Design-System-API; ungenutzte Exporte werden per Tree-Shaking entfernt.
  `.A` = Branch-Marker des Owners.
- **package.json:** `eslint`, `@eslint/js`, `typescript-eslint`, `vitest`, `jsdom`,
  `@testing-library/react`, `rollup-plugin-visualizer` → `devDependencies`.
- **CI:** läuft zusätzlich bei Push auf Branch `A`.
- **Doku:** PLAN/MIGRATION mit B-42-Statusbanner, veraltete Regeln (kein Root-PostCSS, pnpm) korrigiert.
- **Geprüft:** dieselbe Suite wie B-42 nach dem Aufräumen, plus `npm ci` aus dem Lockfile.


### B-42 – Blocker-Fixes + Next.js-Hülle (Claude / Anthropic)

- **Fix (API):** `src/db/migrate.ts` – `await` im nicht-async `.catch`-Callback (TS1308) verhinderte
  Build und Migration.
- **Fix (API):** `npm install` in `apps/api` brach ab (npm-Arborist `edgesOut`); Ursache war
  `vitest` als devDependency. Entfernt – API-Tests laufen über den Root-Runner. Lockfile eingecheckt.
- **Neu:** Next.js 16 als primärer Build (`npm run dev|build|start`), SPA via `dynamic(ssr:false)`,
  `app/api/health`, `next.config.ts` (ersetzt das CommonJS-`next.config.js`), `postcss.config.mjs`.
- **Umbenannt:** `src/pages/` → `src/views/` (Next reserviert `pages/`).
- **Neu:** `src/lib/config.ts` liest `NEXT_PUBLIC_API_URL` und `VITE_API_URL`; `src/lib/pwa.ts`
  (SW-Registrierung), `src/lib/asset.ts` (Bild-Import Vite/Next).
- **PWA:** gehashte `/_next/static/*`-Assets werden MIME-geprüft gecacht; Offline-Fallback `/`;
  Cache `go-shell-v4-next`. +4 Policy-Tests.
- **Tooling:** `eslint-plugin-react-hooks`, CI-Lint blockierend, CI baut Next + Vite, npm-Scripts
  `typecheck`/`lint`/`test`/`test:api`, Root-`.gitignore`, API-CORS-Default inkl. Port 3000.
- **Geprüft (Node 22, PostgreSQL 16):** `next typegen`, Typecheck, Lint (0/0), Vitest 52/52, Next-Build, Vite-Build (870,33 kB / 312,65 kB gzip), API-Typecheck + `tsconfig.tools.json` + Build, API-Integration 13/13 gegen eine Wegwerf-DB, Rauchtest `next start` (`/`, `/api/health`, CSS, `sw.js`, Manifest).


### Mobile Touch B-41 (Codex / OpenAI)

- Drawer/Sheet/Modal: `dragSnapToOrigin` + deaktiviertes Momentum; kurze, nicht ausreichende
  Ziehbewegungen federn zuverlässig zurück. Sheet-/Modal-Header sind jetzt große Drag-Zonen,
  Schließen-Buttons bleiben unabhängig bedienbar. Drawer ist viewport-sicher und intern scrollbar.
- Neue `SwipeLightbox` für Grow-Galerie und Hall of Fame: Flick/Offset links-rechts blättert,
  Swipe nach unten schließt, Pfeile und Punktnavigation bleiben als zugängliche Alternativen.
- Slider: 44-px-Hitbox, 22-px-Thumb und Touch-Achsensteuerung. Tabs/Segmented/DataTable/Stories
  nutzen Snap-/Overscroll-Verhalten; Social-Actions und Topbar-Controls erfüllen mobile Touch-Ziele.
- Live-Ticker: Desktop-Marquee bleibt; auf Touch-Geräten wird er zum manuell scrollbaren Snap-
  Carousel, die duplizierte Marquee-Kopie ist dort verborgen.
- Pull-to-Refresh: horizontale Gesten werden ignoriert, Schwelle gibt einmaliges Haptik-Feedback,
  Indikator sitzt unter der Safe-Area/Topbar; `touchcancel` wird behandelt.
- Edge-Swipe: schmalere Kante, nur Coarse Pointer, auf iOS wegen System-Back-Geste deaktiviert;
  Burger-Menü bleibt dauerhaft verfügbar.
- Scroll-Lock: ref-counted und iOS-sicher (`position: fixed`, Scrollposition-Restore), sodass
  gestapelte Overlays einander nicht entsperren. Long-Press/Scroll-Lock-Tests hinzugefügt.
- Verifiziert: Frontend-Build B-41 erfolgreich (867,61 kB / gzip 311,75 kB). Neue Tests und reale
  Geräte wurden in dieser Tool-Session nicht ausgeführt.

### Build-Determinismus B-40 (Codex / OpenAI)

- **Tailwind-v4-Scan-Scope begrenzt:** `src/index.css` nutzt jetzt `@import "tailwindcss" source(none)`
  mit expliziten Quellen (`src/`, `index.html`, `app/`). Zuvor scannte Tailwind *jede* Projektdatei,
  wodurch Markdown-Doku, `apps/api/*.ts` und `drizzle/*.sql` Schein-Klassen ins CSS einschleusten —
  das Bundle wuchs bei reinen Doku-Änderungen (872,90 kB). Danach: **861,90 kB / gzip 310,15 kB**,
  also kleiner als vor der Doku-Erweiterung und unabhängig von Backend-/Doc-Edits.
- Verifiziert: kritische Klassen (`min-h-dvh`, `card-hover`, `animate-marquee`, `no-scrollbar`,
  `aspect-[4/5]`, `aspect-square`, `backdrop-blur-2xl`, `grid-cols-5`) weiterhin im Build vorhanden.
- Fallstricke 7 und 8 in `CLAUDE.md` bzw. Tailwind-Abschnitt in `HANDOFF.md` ergänzt.

### Doku-Verifikation B-39 (Codex / OpenAI)

- `.env.example`: doppeltes `POSTGRES_PASSWORD` entfernt (der leere Zweitwert hätte Compose zum
  Abbruch gebracht); `DATABASE_URL`/Passwort als `CHANGE_ME` markiert, Docker- vs. Lokal-Host erklärt.
- `tsconfig.tools.json`: `tests/` wird jetzt tatsächlich typegecheckt (geerbtes `exclude` überschrieben).
- `apps/api`: `vitest` als eigene DevDependency, damit die Integrationstests nicht vom Root-`node_modules` abhängen.
- `HANDOFF.md`: Pfadliste vervollständigt, Backend-Fallstricke (NodeNext-`.js`, Drizzle-Gegenrelationen,
  Migrations-Baseline, Presign-Hostname) und Pflicht-Startblock §9.1 ergänzt.
- Status in README/CLAUDE/DESIGN/TODO/TESTING/API-README auf B-39 synchronisiert.
- Frontend-Build unverändert grün. API-Typecheck, Integrationstests und Docker sind weiterhin offen.

### Stabilisierung B-38 (Codex / OpenAI)

- Backend-Startpfade, ESM-Imports und Drizzle-Relationen korrigiert. Eingecheckte Initialmigration,
  getrennte Node-Runtime/Tools und sicherere Compose-Defaults ohne automatischen Demo-Seed.
- Autorisierung: aktuelle DB-Rolle, Chat-Mitgliedschaft, private Community-Discovery,
  atomare Einladungs-Einlösung, Last-Admin-Schutz und authentifizierte Upload-Signierung.
- Private API-Daten aus dem PWA-Cache entfernt; öffentliche Shell-Allowlist mit Upgrade-Bereinigung.
- Dev-Admin an echte Service-Abfragen angebunden; Rollen statt Level/Titel; unbekannte Health-
  Zustände bleiben unbekannt. Lokale Feature-Flags werden als Vorschau gekennzeichnet.
- Session-Restore/Logout gegen verspätete Antworten abgesichert; HTTP-Timeout/no-store und
  Regressionstests für Cache/Auth/Flags/Requests sowie PostgreSQL-Sicherheitsfälle ergänzt.
- Frontend-Build bestätigt (862.56 kB, gzip 310.29 kB). Tests, API-Typecheck, Docker und Geräte-
  Abnahme sind noch nicht ausgeführt. Siehe `docs/TESTING.md`, auch zum offenen Abhängigkeiten-Audit.

### B-35 … B-37 (claude-grow-dev) – Sammeleinträge ohne eigene Überschrift

Die folgenden Blöcke (Dokumentation, Laufzeit-Audit, Communities MVP, Touch-Gesten) stammen aus der Zeit vor der B-Nummerierung je Aufgabe; Inhalt unverändert.

#### Dokumentation
- `HANDOFF.md` vollständig auf Build B-37, Service-/Backend-/Communities-Stand aktualisiert.
- README, ARCHITECTURE, PLAN, MILESTONES, TODO, CLAUDE, MIGRATION und API-README synchronisiert;
  beschädigte doppelte MILESTONES-Sektion entfernt. — *claude-grow-dev*

#### Fixed
- **Runtime/Registry-Audit:** fehlenden `useEdgeSwipeToOpen`-Import sowie durch frühere parallele
  Edits verlorene Admin-Service-Typen/-Registrierungen wiederhergestellt. `AdminService` ist jetzt
  in Mock + API + `Services` Registry vollständig vorhanden. — *claude-grow-dev*
- **Backend:** zuvor dokumentierte, aber nicht persistierte `apps/api/src/routes/admin.ts` jetzt
  tatsächlich vorhanden und in `/admin` gemountet; Social-Like-Query auf korrektes
  `and(eq(...), eq(...))` umgestellt. — *claude-grow-dev*
- **Touch:** Edge-Swipe-Hook hat nun einen stabilen `enabled`-Parameter statt wechselnder No-op-
  Callbacks (keine unnötigen Listener-Neuregistrierungen). — *claude-grow-dev*

#### Added
- **Communities MVP**: neue View `communities` (Feature-Flag + Sidebar/Mehr/⌘K), öffentliche und
  private Gruppen, Suche, Erstellen, öffentlicher Beitritt, Invite-Code-Beitritt (`demo-private`
  im Mock), Detail mit Mitglieder-/Rollenverwaltung und Invite-Code-Erstellung. Vollständig über
  `CommunityService` (Mock + API) / `useCommunities` / `useCommunity`. — *claude-grow-dev*
- **Backend Communities**: `/communities` (list/get/create), `/:id/join`, `/:id/invites`, `/join`,
  Member-Rollen-Patch — JWT, Private-Access-Check, Admin-Check, TTL/MaxUses für Invites; Seed enthält
  eine öffentliche und eine private Test-Community. — *claude-grow-dev*
- **Backend-Grundgerüst** (`apps/api`): selbst hostbares REST-Backend (Hono + Drizzle +
  PostgreSQL + MinIO) mit REST-Vertrag exakt passend zum Frontend-Service-Layer. Enthält:
  - Drizzle-Schema (users, grows/logs/photos/env, strains, breeders, products, offers, hall,
    wiki, communities, invites, forum/subs/threads/votes/comments, chat, notifications) + Relations.
  - Auth (Register/Login/Me, Argon2 + JWT), Grows-CRUD mit Ownership, Forum (Threads/Kommentare/
    Votes), Social (Posts/Likes), Chat, Notifications, Katalog-Routen, Presigned S3-Uploads.
  - `docker-compose.yml` (Postgres + MinIO + API), `Dockerfile`, `seed.ts` (Bucket + Admin +
    Katalog + Demo-Content), validierte Env (Zod), API-README.
  - Frontend-`config.useMock`/`VITE_API_URL` schaltet ohne UI-Änderung auf das Backend um.
- **Quick-Wins-Batch** (UI auf echte Daten + Interaktion):
  - *Service-Abschluss:* `Marketplace`, `Breeders`, `HallOfFame`, `Planner`, `Report`, `Profile`, `Dashboard`
    nutzen jetzt Services/Hooks (`useProducts`, `useBreeders`, `useHall`, `useStrains`, `useGrows`,
    `useActivity`, `useSeedOffers`). Neue Services: `ProductService`, `BreederService`, `HallService`,
    `ActivityService`. In-Memory-Store für erstellte Forum-Threads/Kommentare.
  - *Auth-Gate:* App verlangt Login (ungeloggte Views zeigen Auth-Page); Profile zeigt echte Session
    (`useAuth`); Login/Register setzen den User.
  - *Echte Forum-Actions:* „+ Thread“ öffnet BottomSheet-Formular (Titel/Bereich/Text) → `createThread`;
    „Antworten“ postet via `addComment`. Loading-States.
  - *Global-Search (⌘K):* durchsucht jetzt auch Sorten, Threads und Produkte (Inhalt-Sektion), nicht
    nur Navigation.
  - *Button `loading`-Prop* (Spinner + disabled) — genutzt im Auth-Submit.
  - *ErrorBoundary:* globale Fallback-Ansicht bei Render-Crash (Neu laden).
- **P0b Feature-Flags:** `src/config/features.ts` (Defaults) + `FeatureProvider` (localStorage-Overrides).
  Nav, ⌘K, Bottom-Nav „Mehr“ und Views gehorchen `isEnabled()`. Kern-Features nicht abschaltbar.
- **Developer-Admin** (`devAdmin`): Flag-Matrix, Health-Karten (Mock), User-Tabelle (Mock), Reset auf Datei-Defaults.
  Disabled Views → EmptyState mit Link zum Panel. — *claude-grow-dev*

Build: `dist/index.html` ✅ (P0b).

#### Fixed — Touch-Gesten (überall sauber)
- **BottomSheet:** `drag="y"` auf dem ganzen Panel nahm dem Browser das native Scrollen des
  Sheet-Inhalts (framer setzt `touch-action: none`). Drag jetzt **nur über den Griff** via
  `dragListener={false}` + `dragControls` — Inhalt scrollt wieder, Sheet lässt sich am Griff schließen.
- **Modal (Mobile):** sah aus wie ein Sheet, hatte aber nur einen dekorativen Griff → gleicher
  Handle-Drag wie BottomSheet (`drag={isMobile ? "y" : false}`).
- **Edge-Swipe (Menü öffnen):** Overlay-DOM (20 px, `z-35`, `touch-none`) blockierte Klicks und
  horizontales Scrollen am linken Rand (Tabs, Segmented, Ticker, Stories). Ersetzt durch **passiven
  window-Listener** (`useEdgeSwipeToOpen`) mit Richtungs-Priorität — kein DOM, keine Blockade.
- **Long-Press (Hall of Fame):** Kontextmenü feuerte bereits beim **Scrollen** über eine Karte.
  Bricht jetzt bei Bewegung > 10 px, Verlassen, Abbruch und Nicht-Primärkontakt ab.
- **Pull-to-Refresh:** löste in offenen Overlays und in Formular-Feldern aus. Prüft jetzt
  Body-Scroll-Lock (Overlay offen) und `input/textarea/select/contenteditable`.
- **Drawer:** explizites `touchAction: "pan-y"` — vertikales Scrollen im Drawer-Inhalt bleibt nativ.
- **Code-Optimierung:** ungenutzte Imports bereinigt (`Grows`), unnötigen Drag-Controls-Import entfernt (`ui.tsx`), Inline-Icon-Platzierung in Text korrigiert. — *claude-grow-dev*
- **P1 Service-Verdrahtung:** Social (`useSocialPosts`, IndexedDB nur noch im Mock-Service), Grows (`useGrows`), Sorten (`useStrains`), Dashboard (aktive Grows aus Service), Auth (`useAuth().login/register`), **Forum/Chat/Wiki/Notifications auf Hooks (keine direkten Mock-Imports)**. — *claude-grow-dev*

---

## [v0.12.0] — 2026

### Added — Next.js Monorepo Vorbereitung
Next.js App Router Skeleton + Monorepo-Scaffolding (der Vite-Build bleibt voll funktionsfähig):
- **`app/layout.tsx`**: Root-Layout (Metadata, Viewport, Fonts, No-FOUC-Theme-Script, CSS-Import).
- **`app/page.tsx`**: `"use client"` + `dynamic`-Import der App (`ssr:false` — Canvas/IndexedDB).
- **`next.config.js`**: Next.js Config (`@`-Alias via tsconfig, strict mode, Pexels-Images vorbereitet).
- **`pnpm-workspace.yaml`**: Monorepo-Workspace (`apps/*`, `packages/*`).
- **`MIGRATION.md`**: Umfassende Schritt-für-Schritt-Migration (Monorepo-Setup, Package-Split,
  File-based Routing-Mapping, Tailwind v4, Service Worker, 12-Punkte-Checkliste).
- `App.tsx` mit `"use client"` (Client-Boundary für Next.js; Vite ignoriert die Direktive). — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-27, ~813 kB / 296 kB gzip).

---

## [v0.11.0] — 2026

### Added — Backend-/Daten-Schicht-Grundgerüst
Saubere Service-Layer-Architektur, die Mock-Daten (Default) und ein echtes Backend (via
`VITE_API_URL`) austauschbar macht – ohne die bestehende UI zu brechen.
- **`src/types/index.ts`**: zentrale Domänen-Typen (re-exportiert + `User` + `CreateGrowInput`/`CreatePostInput`).
- **`src/lib/config.ts`**: `apiBaseUrl` + `useMock`-Flag (gesteuert über `VITE_API_URL`).
- **`src/lib/api.ts`**: HTTP-Client (`http.get/post/put/patch/delete`), `ApiError`, Bearer-Token via `setAuthToken`.
- **`src/lib/auth.tsx`**: `AuthProvider`/`useAuth` (login/register/logout, Token-Persistenz, Session-Restore; Mock & API).
- **`src/services/`**: Service-Verträge (`interfaces.ts`) + Mock-Impl (`mock.ts`, IndexedDB + Latenz) + API-Impl (`api.ts`, REST) + Factory (`index.ts`).
- **`src/data/`**: `DataProvider`/`useServices` + Hooks (`useGrows`, `useStrains`, `useSocialPosts` mit loading/error/refresh + CRUD-Aktionen).
- **`.env.example`** + `vite-env.d.ts` (Env-Typ). `ARCHITECTURE.md` dokumentiert Schichten, Pattern & REST-Konvention.
- App um `AuthProvider` + `DataProvider` erweitert. UI nutzt weiterhin Mock-Daten (Migration erfolgt schrittweise). — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-26, ~813 kB / 296 kB gzip).

---

## [v0.10.0] — 2026

### Added — Infrastruktur / CI
- **Bundle-Analyse**: `vite.analyze.config.ts` (separat, ohne Anpassung der Basis-`vite.config.ts`)
  + `rollup-plugin-visualizer`. Report via `npx vite build --config vite.analyze.config.ts` → `bundle-stats.html`. — *claude-grow-dev*
- **ESLint**: Flat-Config `eslint.config.js` (v9, TypeScript, lenient). Ausführung via `npx eslint .`. — *claude-grow-dev*
- **CI-Pipeline** (`.github/workflows/ci.yml`): `tsc --noEmit` (Typecheck) + ESLint (non-blocking) +
  Vitest + Build. — *claude-grow-dev*

### Changed — Performance
- **Font-Optimierung/Subsetting**: Inter auf die tatsächlich genutzten Weights (400–700) reduziert;
  Google `css2` liefert pro Sprache subsetted WOFF2 (unicode-range) bei `display=swap`. — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-25, ~811 kB / 295 kB gzip).

---

## [v0.9.1] — 2026

### Added — Features-Paket
- **i18n-/Währungs-Umschalter**: `I18nProvider` mit `t()` (de/en) + `money()` (EUR/USD, Mock-Umrechnung
  ×1,08). Sprach- & Währungs-Switcher in den Profile-Settings; Settings-Überschriften lokalisiert;
  Demo-Kosten-Anzeige in der gewählten Währung (Vorbereitung für Voll-i18n). — *claude-grow-dev*
- **Offline-First (IndexedDB)**: `lib/db.ts` (Key-Value-Wrapper). Social-Posts (inkl. eigener Beiträge)
  werden via IndexedDB persistiert und überstehen Reload/Offline. — *claude-grow-dev*
- **Erweiterte AI-Workflows (Mixture-of-Erd's)**: echter **Komponenten-Diff** (added/changed/removed)
  eines Rezepts gegenüber seiner Basis – dynamisch berechnet statt statischem Mock-Diff. — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-24, ~811 kB / 295 kB gzip).

---

## [v0.9.0] — 2026

### Added
- **Grow-Report als PDF**: der „PDF"-Export öffnet eine formatierte Druckansicht (Browser →
  „Als PDF speichern") – offline, ohne schwere Bibliothek (kein jsPDF-Bundle-Bloat). — *claude-grow-dev*
- **Design-System-Showcase**: neue „Design-System"-Seite als Galerie der Komponenten-Bibliothek
  (Buttons, Badges/Chips, Avatare, Formulare, Feedback, Charts, Overlays, Tone-Farben) – in Sidebar,
  Bottom-Nav „Mehr" und Command-Palette erreichbar. — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-23, ~806 kB / 294 kB gzip).

---

## [v0.8.2] — 2026

### Changed
- **TopBar: dauerhaft Burger-Menü** – der Back-Button, der auf Detail-Seiten das Burger-Menü auf Mobile
  ersetzt hatte, wurde entfernt. Das Burger-Menü ist auf Mobile nun **immer** sichtbar (auch auf
  Detail-Seiten). Navigation zurück erfolgt über das Menü oder den „Zurück"-Button im jeweiligen
  PageHeader. — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-22, ~797 kB / 291 kB gzip).

---

## [v0.8.1] — 2026

### Fixed
- **Community-Feed mobile-optimiert**: rechte Seitenleiste (Follow-Vorschläge / Trending-Tags) auf
  Mobile verborgen (nur Desktop = Instagram-Pattern), Stories-Card & Action-Bar mit responsiven
  Abständen kompakter (kein Overflow der Aktionsbuttons mehr). — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-21, ~797 kB / 291 kB gzip).

---

## [v0.8.0] — 2026

### Added
- **Community-Feed (Social-Media-Funktion)**: neue „Social"-Sektion – Instagram/X-artiger Feed mit
  **Stories-Reihe**, **Compose-Box** (Post verfassen), **Posts** (Foto + Text, interaktives
  Like / Kommentar / Teilen / Merken, ⋯-Menü mit Melden), **Follow-Vorschlägen** und **Trending-Tags**.
  Like & Bookmark sind zustandsbasiert; „Teilen" veröffentlicht live in den Feed; Haptik bei Like/Teilen.
  In Sidebar, Bottom-Nav „Mehr" und Command-Palette erreichbar. — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-20, ~797 kB / 291 kB gzip).

---

## [v0.7.0] — 2026

### Added
- **Unit-Tests (Vitest)**: `vitest.config.ts` + `src/lib/format.test.ts` (eur/n/pct/clamp/timeAgo) und
  `src/components/charts.test.ts` (`smooth` Edge-Cases: leer / Einzel-Punkt / Mehrere). Aufruf via
  `npx vitest run`. — *claude-grow-dev*
- **`role="list"`/`role="listitem"`** auf Forum-Kommentaren & Dashboard-Aktivitätsfeed (A11y). — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-19, ~798 kB / 290 kB gzip).

---

## [v0.6.1] — 2026

### Added — PWA/Deploy
- **PNG-Icons (192/512)**: generierte App-Icons (jeweils `any` + `maskable`) ins Manifest aufgenommen
  (zusätzlich zum SVG) für volle Installierbarkeit auf Android/Chrome. — *claude-grow-dev*
- **`apple-touch-icon` als PNG** (192/512) in `index.html` (iOS-Home-Screen). — *claude-grow-dev*
- **Background-Sync**: Service-Worker lauscht auf `sync` (Tag `go-sync`) und re-wärmt die Shell;
  `main.tsx` registriert die Sync bei `online`-Event. — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-18, ~787 kB / 289 kB gzip).

---

## [v0.6.0] — 2026

### Added — Mobile/UX-Paket
- **Pull-to-Refresh** (global): `usePullToRefresh`-Hook + gleitender Indikator; am Scroll-Top ziehen →
  Spinner + „Aktualisiert"-Toast. — *claude-grow-dev*
- **Skeleton-Loading beim View-Wechsel**: `useDelayedReady` + `PageSkeleton` (kurzer Shimmer-Flash pro
  Navigation; `prefers-reduced-motion` → sofort). — *claude-grow-dev*
- **Lang-Druck-Kontextmenü**: `useLongPress` auf Hall-of-Fame-Karten → Bottom-Sheet (Link kopieren /
  Merken / Melden); kurzer Tap bleibt Lightbox. — *claude-grow-dev*
- **Bottom-Nav „Mehr"-Overflow**: 4 primäre Tabs + „Mehr" öffnet ein Sheet mit weiteren Bereichen
  (Marktplatz, KI, Wiki, Hall of Fame, Chat, Kostenrechner). — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-17, ~787 kB / 289 kB gzip).

---

## [v0.5.1] — 2026

### Fixed
- **Onboarding/Willkommen responsiv**: scrollbare Layer (Card zentriert bei Platz, scrollt bei
  Overflow), Safe-Area-Top, responsive Typo/Spacing/Icons – kein Abschneiden mehr auf kurzen Viewports. — *claude-grow-dev*

### Added
- **Marktplatz-Filter (echt)**: Popover mit Zustand (Neu/Wie neu/Gebraucht) + Preis-Slider + Reset;
  Live-Filterung der Produkte + aktive-Filter-Badge. — *claude-grow-dev*
- **Service-Worker**: stale-while-revalidate für Bilder (inkl. remote Pexels), Navigation network-first
  mit Offline-Shell-Fallback. — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-15/B-16, ~792 kB / 288 kB gzip).

---

## [v0.5.0] — 2026

### Added
- **`DataTable`-Komponente** (generisch, zugänglich, Zebra-Zeilen, Horizontal-Scroll) für die Library;
  die Planner-Vergleichstabelle wurde darauf umgestellt. — *claude-grow-dev*
- **SmartImage-Fehler-Fallback**: Gradient + Icon-Placeholder bei Lade-Fehlern statt kaputtem Bild. — *claude-grow-dev*
- **Sorten-Farb-Coding**: konsistente Typ-Farben (Sativa = info / Indica = soil / Hybrid = leaf) für
  Strain-Cards & Strain-Detail-Modal. — *claude-grow-dev*

### Changed
- AI-Chat-Nachrichten-Container nun `role="log"` + `aria-live="polite"` (Streaming für Screenreader). — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-14, ~779 kB / 286 kB gzip).

---

## [v0.4.2] — 2026

### Added
- **Custom Auto-Hide-Scrollbar** (Mobile): `useAutoHideScroll`-Hook + `MobileScrollbar` – ein schmaler
  Thumb erscheint **nur beim Scrollen** und blendet danach aus. Native Leiste auf Mobile verborgen
  (`scrollbar-width:none` + WebKit `width:0`). Funktioniert zuverlässig in Vorschau & nativ. — *claude-grow-dev*
- **Popover-Komponente** (`Popover` + `PopoverItem`) für die Library (Outside-Click- & ESC-Schließen,
  `role="menu"`); integriert im Forum-Thread als ⋯-Menü (Link kopieren / Merken / Melden). — *claude-grow-dev*

### Changed
- Dashboard-Greeting-Buttons auf Mobile: 2 gleichbreite Spalten (zentriert) statt knapper Inline-Buttons. — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-12/B-13).

---

## [v0.4.1] — 2026

### Changed
- **Mobile-Scrollbar**: Custom-Scrollbar nur noch ab `lg` (Desktop). Auf Mobile wird sie nicht
  mehr gerendert → iOS/Android zeigen das **native Auto-Hide-Overlay** (nur während des Scrollens
  sichtbar); Firefox Mobile verbirgt die Leiste. — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-11).

---

## [v0.4.0] — 2026

### Added
- **Accessibility-Paket**: Focus-Trap in Modal/Drawer/BottomSheet (neuer `useFocusTrap`-Hook),
  Skip-to-Content-Link am Shell-Anfang, `aria-live` für Toasts. — *claude-grow-dev*
- **Partikel-Toggle** in den Profile-Settings (Spec-Anforderung „abschaltbar"), via `ThemeProvider`
  persistiert (`localStorage`). — *claude-grow-dev*
- **Haptisches Feedback**: `vibrate()`-Helper, eingesetzt bei Bottom-Nav-Taps & Forum-Votes. — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-10, ~774 kB / 284 kB gzip).

---

## [v0.3.1] — 2026

### Fixed
- **Tote Schaltflächen interaktiv gemacht** – zuvor ohne Aktion: `Planner` „Auswählen" (jetzt echte
  Medium-Auswahl mit State + Highlight), `NotFound` „Jetzt starten" (→ Dashboard),
  `HallOfFame` „Mehr anzeigen", `Profile` „Bearbeiten", `Chat`-Icon-Buttons (Info/Anhang/Emoji).
  Alle Schaltflächen reagieren nun mit Toast-/Navigations-Feedback. — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (B-09).

---

## [v0.3.0] — 2026

### Added
- **Notifications als mobiles Bottom-Sheet**: Auf Mobile gleitet das Benachrichtigungs-Menü nun als
  Slide-Up-Sheet hoch (natives Pattern) statt als überlaufendes Dropdown. Desktop bleibt Dropdown.
  — *claude-grow-dev*
- **Komplettes Doku-Set**: `README.md` (aktualisiert), `CLAUDE.md`, `DESIGN.md`, `CHANGELOG.md`,
  `PROGRESS.md`, `TODO.md` – jede Datei signiert. — *claude-grow-dev*

### Fixed
- **Desktop-Sidebar-Overlap (kritisch)**: `--sb-w` wurde ohne `px`-Einheit gesetzt →
  `padding-left: 272` (ungültig) → Sidebar überlappte den gesamten Content auf Desktop.
  Korrigiert zu `${w}px`. — *claude-grow-dev*
- **Sticky-TopBar-Sicherheit**: `overflow-x: hidden` → `overflow-x: clip` auf `body`
  (verhindert Sticky-Breaking). — *claude-grow-dev*
- **Sidebar-Lesbarkeit**: Opazität `/60` → `/90` (war sinnlos transparent). — *claude-grow-dev*

### Build
- `dist/index.html` ✅ stabil (Single-File). Letzter erfolgreicher Build validiert.

---

## [v0.2.0] — 2026

### Added
- **Count-up-Animationen**: `CountUp`-Komponente (motion.tsx, ease-out-cubic, reduced-motion-safe);
  Dashboard-Stat-Karten zählen beim Betreten hoch. — *claude-grow-dev*
- **Swipe-Gesten**: Grow-Galerie-Lightbox per `drag="x"` + `dragSnapToOrigin`. — *claude-grow-dev*
- **Scroll-to-Top-Button** (mobile) mit Spring-Animation. — *claude-grow-dev*
- **Smart-Image-Loading**: `SmartImage` mit Shimmer-Placeholder; integriert in Hall of Fame,
  Dashboard-Grow-Cards, Grow-Liste/-Detail. — *claude-grow-dev*

### Changed
- **Modal → Bottom-Sheet auf Mobile**: Slide-up, Handle-Bar, sticky Footer; Desktop bleibt zentriert. — *claude-grow-dev*

### Fixed
- **Charts hartiert** gegen leere Arrays (`Sparkline`, `Bars`). — *claude-grow-dev*
- **ESC schließt** jetzt Command-Palette & Modal (vorher nur Anzeige). — *claude-grow-dev*

---

## [v0.1.0] — 2026 — Initiales Template

### Added
- Komplettes Design-System (Light/Dark, Tokens, Glass/Neu, Elevation, Glow, Grain).
- 21 Screen-Kategorien: Dashboard, Auth, Grows, Strains, Breeders, Marketplace, Wiki, Forum, Chat,
  Hall of Fame, Kostenrechner, Verbrauch, Simulation, Planung, Report, AI-Assistent (inkl.
  Mixture-of-Erd's Git-Diff), Notifications, Profil/Settings, Telegram, Onboarding/Splash/404.
- Wiederverwendbare Component-Library (ui.tsx) + eigene SVG-Charts (charts.tsx).
- Layout-Shell: Sidebar, TopBar, BottomNav, FAB, Drawer, Command-Palette (⌘K), Toasts.
- Partikel-Background (Canvas), Framer-Motion Animationen, `prefers-reduced-motion`.
- PWA-Grundgerüst: `manifest.webmanifest`, `sw.js`, `icon.svg`; Onboarding/Install-Prompt.
- Zentrale Mock-Daten (`mocks/data.ts`), atmosphärischer Hero (inlined). — *claude-grow-dev*

---

> **Dokumentation gepflegt von:** Claude (Anthropic) · Kennung `claude-grow-dev` · Stand 2026

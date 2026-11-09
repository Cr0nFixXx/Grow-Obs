# CHANGELOG.md

Alle nennenswerten Änderungen an **Grow|Observer**, je Aufgabe (B-Nummer) mit den **gemessenen** Prüfergebnissen („Geprüft“, „Tests“, „Nicht geprüft“).
Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/). Die Ein-Zeilen-Übersicht je Aufgabe steht in [`PROGRESS.md`](PROGRESS.md)
(das vollständige alte Protokoll mit Bundle-Größen: `archive/PROGRESS-bis-B62.md`).

**Versionen:** Seit B-52 steuert `version.json` die Versionen (Frontend „Ruderalis“ 0.1.2, Backend 0.0.3; vom Eigner vergeben). Die frühere Zählung (`v0.x`, zuletzt 0.50.0)
und die B-Nummern vor B-52 sind historisch und bleiben unverändert. Neue Einträge tragen keine Agenten-Signatur und nennen ihre Prüfergebnisse selbst; Teststand und offene Gates: `docs/TESTING.md`.

---

## [Unreleased] – Frontend „Ruderalis“ 0.1.2 · Backend 0.0.3 (seit B-52)

### B-86 – Grows Runde 3: weiche Diagramme, Zielbereiche für pH und EC

**Anlass:** Die Diagramme wirkten spitz und eckig (gerade Linienstücke zwischen den Punkten). Zusätzlich gab es kein Zielband für pH und EC (der Eigner hat es für Runde 3 gewählt).

- **Weiche Kurven überall:** `smooth()` in `charts.tsx` nutzt jetzt monotone kubische Interpolation (Fritsch–Carlson) statt Catmull-Rom: rund, aber ohne Überschwingen (ein Plateau schwingt nicht unter die Messwerte). `EnvChart` (Messwerte), `SeriesChart` (Dashboard-Klima, Report, Simulation, Verbrauch), `Sparkline` und `Bars` teilen den Stil.
- **Dynamik:** Linie und Fläche werden beim Laden von links aufgedeckt (`clip-path`), Punkte poppen gestaffelt auf, Balken wachsen, `SeriesChart` hat einen atmenden Punkt am letzten Wert, das Fadenkreuz im Messwert-Diagramm gleitet. Flächenverlauf je Reihe. Bei „Weniger Bewegung“ (System oder Einstellung) greift die vorhandene globale Regel, die Animationen sofort beendet.
- **Weniger Rauschen:** Ab 15 Punkten je Reihe werden nur Werte außerhalb des Zielbands und der angetippte Punkt als Kreis gezeichnet.
- **Zielbereiche je Grow:** Migration 0022 (`grows.ph_min/ph_max/ec_min/ec_max`, Standard pH 5,8–6,5 und EC 1–2 mS, `NULL` = kein Band, auch für bestehende Grows). `PATCH /grows/:id` nimmt `targets: {ph?: {min,max}|null, ec?: {min,max}|null}` (strikt; pH 0–14, EC 0–10, Minimum < Maximum); das DTO liefert `targets`. Im Dialog „Grow bearbeiten“ vier Felder; beide leer = Band aus; unvollständig oder ungültig wird abgelehnt.
- **Wirkung:** Band im pH-/EC-Diagramm (pH links, EC rechts), Punkte außerhalb rot, Tooltip nennt „zu hoch/zu niedrig“, Messwert-Liste markiert Werte rot mit Pfeil (auch als Text für Screenreader), und über den Diagrammen steht je Größe ein Hinweis, wenn der **letzte** Wert (pH, EC, VPD) außerhalb liegt. Das VPD nutzt weiter das feste Band 0,8–1,2 kPa. Keine Push-Warnung.
- **Kleinfehler:** Die Zeitachse zeigt bei einem einzelnen Tag keine doppelten Datumsbeschriftungen mehr.
- **Tests:** API 309 (neu: Zielbereiche 1, Migration 0022 idempotent 1), Vitest 317 (neu: `GrowMeasurements.test.tsx` 3, `EnvChart` +3, `charts` +2, `grows` +3, `GrowDialogs` +1), E2E `grows-lifecycle.spec.ts` um Hinweis/Markierung/Bereich ändern erweitert (beide Tests grün); `tsc` (Frontend, API, `tsconfig.tools.json`) und ESLint sauber. Ansicht mit 31 Messtagen per Playwright-Screenshot geprüft.
- **Nicht geprüft:** Bedienung und Animationen auf einem echten Handy; Migration 0022 ist noch **nicht** in der Produktion eingespielt (`SKIP_MIGRATIONS=true`, von Hand nötig).

### B-87 – E-Mail: Passwort vergessen, Adresse bestätigen, Adresse ändern

**Neu (nur wirksam, wenn ein SMTP-Server konfiguriert ist; ohne Konfiguration verhält sich die App wie bisher):**
- **Passwort vergessen:** Auf der Anmeldeseite öffnet „Passwort vergessen?“ ein Formular (vorher zeigte der Knopf nur eine Schein-Meldung). Die Antwort ist für bekannte und unbekannte Adressen gleich. Der Link gilt **1 Stunde und genau einmal**; ein neuer Link entwertet den alten. Nach dem Setzen des neuen Passworts werden **alle Sitzungen beendet**; die Adresse gilt dadurch als bestätigt. Ein Tippfehler im neuen Passwort verbraucht den Link nicht.
- **E-Mail bestätigen (Pflicht):** Nach der Registrierung geht ein Link (24 h, einmalig) an die Adresse. Bis zur Bestätigung zeigt die App nur eine Seite mit „Link erneut senden“ (höchstens 3 je 15 Minuten, Knopf 60 s gesperrt), „Falsche Adresse ändern“, „Ich habe bestätigt“ und „Abmelden“; der Server lehnt alles andere mit `403 email_unverified` ab (auch WebSocket). **Bestandskonten gelten als bestätigt** (die Migration markiert sie einmalig). Die Pflicht ist nur aktiv, solange Mailversand konfiguriert ist – sonst könnte sich bei kaputtem Versand niemand mehr neu registrieren. Der Betreiber kann Adressen unter Dev-Admin → Benutzer von Hand bestätigen.
- **Adresse ändern:** Profil → Sicherheit → „E-Mail-Adresse“ (neue Adresse + Passwort). Der Link geht an die NEUE Adresse, die alte bleibt gültig, bis er geöffnet wird, und bekommt einen Hinweis; belegte Adressen werden abgelehnt (auch wenn sie zwischenzeitlich vergeben wurden: 409). Offene Reset-Links der alten Adresse werden entwertet. Das Anmeldeprotokoll kennt drei neue Ereignisse (Passwort per Link zurückgesetzt, Adresse bestätigt, Adresse geändert).
- **Sicherheit:** Tokens sind 32 Zufallsbytes, in der Datenbank steht nur der SHA-256-Hash; Einlösung atomar. Die Links tragen das Token im URL-Fragment (`/#verify=…`, `/#reset=…`) – es landet nie in Server-Logs; die Seite löst es per POST ein (Mail-Scanner, die Links nur abrufen, verbrauchen es nicht) und entfernt es aus der Adresszeile. Link-Basis ist `APP_URL` bzw. `NEXT_PUBLIC_SITE_URL`, nie der Host der Anfrage. Versandfehler loggen nur einen Fehlercode, keine Adresse. Limits: Passwort vergessen 5 je Stunde und Adresse/IP, Link einlösen 20 je Stunde und IP, Adresse ändern 5 je 15 Minuten.
- **Technik:** `lib/mailer.ts` (Transporte `smtp`, `console`, `memory`, `off`; die beiden Testtransporte gelten in Produktion nie), `lib/auth-tokens.ts`, `lib/mail-templates.ts` (Text + HTML, Namen maskiert), Migration 0023 (`users.email_verified_at`, Tabelle `auth_tokens` mit RLS), neue Pakete `nodemailer` (+ Typen). Neue Variablen: `SMTP_HOST`, `SMTP_FROM`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `APP_URL` (siehe `apps/api/README.md`). Betreiber-Konten per CLI gelten als bestätigt.
- **Grenze:** Ob Mails eines bestimmten Anbieters im Postfach statt im Spam landen, hängt von SPF/DKIM der Absenderdomain ab und lässt sich von hier nicht prüfen. Der echte Versand wurde nur gegen einen lokalen Test-Mailserver geprüft, nicht gegen einen echten Anbieter.

**Tests:** API `email-auth.integration.test.ts` (20: Sperre, Bestätigung, Ablauf/Einmaligkeit, Hash in der DB, Reset mit Sitzungsende, Reset-Link abgelaufen/ersetzt, Betreiber-Bestätigung, Adresswechsel inkl. Konflikt, Migration mit Bestandskonten, Limits) und `mailer.test.ts` (6: Modi, Produktion, echtes SMTP gegen Test-Server, Fehlerfall, Link-Basis); Vitest `AccountLinks.test.tsx` (13); E2E `mail-flow.spec.ts` (Projekt „mail“, zweiter Server mit echtem SMTP-Transport zu `tests/e2e/support/mail-sink.mjs`: registrieren → Sperrseite → Link → App → Link verbraucht → Passwort vergessen → Reset-Link → altes Passwort scheitert, neues klappt).

### B-86b – Aufräumen: Wochenreport nach Eintragsdatum, B-78/B-79 in Produktion gemessen

- **Wochenreport:** zählt „Einträge in 7 Tagen“ jetzt nach dem Eintragsdatum (`grow_logs.logged_on`, die letzten 7 Kalendertage in Europe/Berlin, heute eingeschlossen) statt nach dem Anlegezeitpunkt. Ein rückwirkend nachgetragener Eintrag zählt damit für den Tag, an dem er passiert ist, ein heute nachgetragener Alt-Eintrag nicht mehr. Test erweitert (Eintrag am Rand des Fensters, einer außerhalb, ein Nachtrag mit altem Datum). Keine Migration.
- **B-79 gemessen (Produktion, Build 26110905, aus Dortmund):** `/api/features` 0,20–0,21 s (erste Anfrage 0,42 s), `/api/forum/threads` 0,23–0,26 s, `/api/version` ohne Datenbank 0,19 s – die Datenbank kostet also rund 10–70 ms je Anfrage (die Verbindung wird je Anfrage neu aufgebaut, wie angekündigt). 20 + 20 gleichzeitige Anfragen (`/features`, danach `/forum/threads`): alle 40 Antworten 200, kein `DB_TIMEOUT`, kein `XX000`.
- **B-78 geprüft (Produktion):** In `media` stehen 6 Zeilen, alle von irgendwo referenziert; **0** Waisen älter als 24 h (gleiche Abfrage wie `sweepOrphanMedia`, `MEDIA_REFERENCES` vollständig nachgebaut). Beide Cron-Routen antworten ohne Geheimnis mit 401 (also vorhanden), `vercel.json` plant `media-cleanup` täglich 03:30 UTC. **Nicht belegt:** dass der Cron selbst gelaufen ist – es gab keine Waisen zum Entfernen, und das Vercel-Laufzeitprotokoll ist von hier nicht lesbar; ein Aufruf mit `CRON_SECRET` wurde nicht ausgelöst, weil der Wert nicht lesbar ist.

### B-86a – Nachbesserung Diagramme: Lücken überbrücken, Achse nach Datenlage

**Anlass (Rückmeldung des Eigners):** Diagramme zeigten bei fehlenden Tagen nicht alles und wirkten weiter eckig. Ursache am echten Grow „Cherry Run - Klein“ (Messwerte 22.–25.10., dann 05.11. und 09.11.): (1) Die Linie riss bei Lücken über 7 Tage ab, ein Zwei-Punkte-Stück war eine gerade Linie; (2) im Zeitraum „Alles“ lief die Achse bis zum letzten Tag aller Messwerte, das pH/EC-Diagramm endete aber am 25.10. und blieb rechts leer.
- **Eine durchgehende Kurve** durch alle Messpunkte, auch über lange Lücken (die Punkte sind die echten Messungen); der alte Abriss bei > 7 Tagen entfällt.
- **Achse je Diagramm:** ohne feste Grenzen (Zeitraum „Alles“) reicht sie vom ersten bis zum letzten Tag mit einem Wert **dieses** Diagramms; 7/30 Tage behalten das feste Fenster.
- **Rundere Kurven:** Bézier-Griffe halb so lang wie der x-Abstand (vorher ⅓), Tangenten so begrenzt, dass die Kurve nie über die Messwerte hinausschwingt.
- **Tests:** `EnvChart` (Linie über Lücke in einem Zug, Achse endet beim letzten Wert des Diagramms), Rest unverändert; Ansicht mit den Cherry-Run-Werten per Screenshot geprüft. Keine Migration.
- **Grenze:** Schwankt ein Wert von Tag zu Tag (z. B. 23 → 24 → 23 °C) auf einer langen Achse, bleibt die Kurve ein schmaler Hügel – das sind die Daten, keine Eckigkeit der Linie.

### B-85 – Grows Runde 2: Tagebuch, Messwerte, Diagramme, Fotos verwalten

**Ausgangslage:** Log-Einträge waren nach dem Speichern fest („heute“ als Text, Tag aus dem Grow-Stand), einzelne Fotos ließen sich nicht löschen, für Temperatur, Luftfeuchte und EC gab es keine Eingabe (`grow_env` blieb leer; Dashboard und Report zeigten teils feste Beispielwerte). Versionen unverändert, nur die Build-Nummer. **Migration `0021_grows_diary.sql`** (handgeschrieben, idempotent): `grows.leaf_offset` (Standard 2), `grow_logs.logged_on` (Datum, Bestand aus `created_at` in Europe/Berlin), `grow_photos.caption`, `grow_env.ph` und `grow_env.logged_on` (Bestand aus Startdatum + Tag), Messwerte nullable, Duplikate je Tag zusammengeführt, Unique-Index `(grow_id, logged_on)`.

- **Log-Einträge:** neue Einträge haben ein echtes Datum (heute vorbelegt, rückwirkend wählbar, nie vor dem Start und nie in der Zukunft); der Tag wird daraus berechnet. Titel, Text, Kategorie und Datum sind nachträglich änderbar, Löschen mit Bestätigung. Liste nach Datum, neueste zuerst.
- **Fotos:** je Foto Bildunterschrift (≤ 200 Zeichen), „Als Titelbild verwenden“ und Löschen (Datei wird mit entfernt, außer sie wird anderswo verwendet, z. B. als Profilbild); wird das Titelbild gelöscht, rückt das nächste nach. Die Beschriftung erscheint in Galerie und Lightbox.
- **Messwerte:** Knopf „Messwerte“ im Grow-Detail öffnet einen Dialog (Datum heute vorbelegt, Temperatur, Luftfeuchte, EC, pH; alle optional, mindestens ein Wert). **Ein Eintrag je Kalendertag:** erneutes Speichern ersetzt den Tag, beim Datumswechsel werden vorhandene Werte vorbelegt; Bearbeiten und Löschen in der Liste unter den Diagrammen. Wertebereiche: Temperatur −10…60, Luftfeuchte 0…100, EC 0…10, pH 0…14.
- **VPD** wird nicht gespeichert, sondern aus Temperatur und Luftfeuchte berechnet (Magnus-Formel); Blatttemperatur = Lufttemperatur minus **Blatt-Abzug** (je Grow einstellbar im Bearbeiten-Dialog, 0–6 °C, Standard 2). Änderung des Abzugs wirkt rückwirkend auf alle Einträge. Live-Anzeige im Messwert-Dialog.
- **Diagramme** (neue Komponente `EnvChart`, Zeitachse mit echten Tagesabständen, Punkt je Tag, Linie reißt ab Lücken > 7 Tage (seit B-86a durchgehend), linke und rechte Skala, Tippen/Hover zeigt die Werte des Tages): Temperatur + Luftfeuchte, pH + EC, VPD mit Zielband 0,8–1,2 kPa; Zeitraum 7 Tage / 30 Tage / Alles. Keine Zielbereiche für pH und EC.
- **Dashboard/Report:** Klima-Karte zeigt den letzten Messwert mit Datum (leere Werte als „–“); im Grow-Report sind die fest eingebauten Durchschnittswerte (VPD 1,21, EC 1,42, pH 6,3, Temperatur 24,6) durch echte Mittelwerte ersetzt („–“ ohne Daten); das Diagramm nutzt nur Tage mit Temperatur und Luftfeuchte.
- **API:** `POST /grows/:id/logs` (optional `date`, strikt; `day` wird ignoriert), `PATCH`/`DELETE /grows/:id/logs/:logId`, `PATCH`/`DELETE /grows/:id/photos/:photoId`, `PUT /grows/:id/env`, `DELETE /grows/:id/env/:date`, `PATCH /grows/:id` + `leafOffset`. DTO: `photos[{id,url,caption,cover}]` (`gallery` bleibt als URL-Liste), `leafOffset`, `env[{day,date,temp,rh,vpd,ec,ph}]`, Logs mit ISO-Datum.
- **Tests:** API 307 (neu: `grow-diary.integration.test.ts` 11 inkl. Migrations-Backfill und Wiederholbarkeit, `grow-state` +2), Vitest 305 (neu: `EnvChart` 5, Dialoge 6, Mock-Tagebuch 1, Hilfen 2), E2E `grows-lifecycle.spec.ts` +1 (Log mit Datum bearbeiten, Messwerte, Diagramme, Foto-Verwaltung); `routing`, `app`, `mobile` grün; tsc und eslint sauber.
- **Produktion geprüft (Commit 212d139):** Migration 0021 von Hand per SQL eingespielt (Produktion hatte keine Einträge, Messwerte oder Fotos; der vorhandene Grow blieb unverändert). Mit zwei Testkonten per HTTP: Log mit Datum (Tag berechnet), Zukunftsdatum 400, Bearbeiten, fremder Eintrag 404, Messwerte speichern (VPD 0,91 bei 25 °C / 60 %), gleicher Tag ersetzt, pH 15 und leere Anfrage 400, fremder Grow 404, Blatt-Abzug 0 → VPD 1,27, Tag löschen, Log löschen, Foto mit Beschriftung, Foto löschen (Titelbild leer), Grow löschen; Testkonten danach gelöscht.
- **CI-Nachtrag:** Der Typecheck der API-Werkzeuge (`apps/api/tsconfig.tools.json`, `npx tsc -p tsconfig.tools.json`) schlug fehl, weil `apps/api/seed.ts` die neuen Pflichtfelder (`logged_on`) nicht kannte und noch ein gespeichertes VPD schrieb. Die Demo-Daten nutzen jetzt relative Datumswerte, ein Startdatum passend zu Tag 64 und pH-Werte. Lokal reproduziert und behoben; geprüft wurden alle CI-Schritte außer Browser-E2E und API-Tests auf Node 22.
- **E2E-Nachtrag (flaky Test):** Im neuen Tagebuch-Test fand `getByText("Zweite Düngung")` je nach Timing zwei Treffer (Liste und Erfolgsmeldung) und scheiterte in der CI (Strict-Mode-Verletzung). Die Suche ist jetzt auf den Hauptbereich (`#app-main`) begrenzt; die App war nicht betroffen.
- **Nicht geprüft:** Bedienung auf einem echten Handy.

### B-84 – Grows Runde 1: bearbeiten, Phase, Zustand, Ernte, Archiv, Löschen

**Ausgangslage:** `day`, `phase`, `progress` und `health` wurden beim Anlegen gesetzt und nie fortgeschrieben; die Profil-Statistik „Ernten“ zählte `phase='Ernte'`, was nie eintrat; der Sortenname ging beim Anlegen verloren. Versionen unverändert (Eigner vergibt), nur die Build-Nummer. **Migration `0020_grows_lifecycle.sql`** (idempotent, `ADD COLUMN IF NOT EXISTS`; Bestand wird übernommen: Phase „Ernte“ → geerntet, Phasenindex, Sortenname, Phasendatum). In Produktion nicht automatisch (`SKIP_MIGRATIONS=true`), siehe Hinweis unten.

- **Tag und Fortschritt** werden aus dem Startdatum berechnet (Europe/Berlin), bei beendeten Grows bis zum Enddatum; das Startdatum ist änderbar (2000-01-01 bis heute), die geplante Dauer 14–400 Tage.
- **Phase** wechselt der Nutzer per Knopf (Keimung, Vegetativ, Blüte, Trocknen, Curing; auch zurück). Das Datum des ersten Wechsels in eine Phase wird gemerkt und im Verlauf angezeigt. Bei beendeten Grows 409.
- **Zustand statt Gesundheit %:** Gesund / Beobachten / Problem, vom Nutzer gesetzt, mit Farbe; Dashboard zeigt „Brauchen Aufmerksamkeit“, der Grow-Report den Zustand. Der erfundene Fazit-Text im Report (stabiler Verlauf, VPD optimal, Düngeempfehlung) ist durch eine Zusammenfassung aus echten Werten ersetzt.
- **Ernte abschließen** ist der Endschritt (jederzeit, auch nach Trocknen/Curing): Datum, Nassgewicht, Trockengewicht (ganze Gramm), Notiz. Der Grow bleibt sichtbar, zählt im Profil als Ernte, Tag und Fortschritt (100 %) frieren ein. Erneutes Speichern trägt Werte nach; leeres Feld löscht den Wert. **Abbruch** zählt nicht als Ernte und verwirft Gewichte. **Wieder aufnehmen** macht den Grow wieder aktiv. Prüfungen: Datum nicht vor Start/Zukunft, Trocken ≤ Nass.
- **Archivieren** blendet den Grow aus „Aktiv“ aus (Liste mit Filter Aktiv / Abgeschlossen / Archiv); **Löschen** nur nach Bestätigung (Dialog nennt Einträge, Messwerte, Fotos und bietet Archivieren an), entfernt Einträge, Messwerte, Fotos und die Bilddateien (per `releaseMedia`, außer bei anderweitiger Verwendung); wiederholtes Löschen und fremde Grows → 204 ohne Wirkung.
- **Anlegen** mit Sortenname, Typ und Startdatum (auch rückwirkend); die Anlege-Route ist jetzt strikt.
- **API:** `PATCH /grows/:id`, `POST /grows/:id/phase|finish|reopen|archive|unarchive`, `DELETE /grows/:id`; das DTO liefert `strain`, `status`, `condition`, `archived`, `endedOn`, `harvest`, `phases[{key,label,done,active,startedOn,startDay}]`. Statistik (`auth`, `members`), Admin-Zähler und Wochenreport zählen nur laufende, nicht archivierte Grows bzw. `status='harvested'`.
- **Tests:** API 292 (neu: `grow-state` 5, `grows.integration` 11 inkl. Medien-Löschung und Migrations-Backfill), Vitest 290 (neu: `grows.test.ts` 5, `GrowDialogs.test.tsx` 7, Mock-Lebenszyklus 1), E2E `grows-lifecycle.spec.ts` (Anlegen mit Startdatum → Phase → Zustand → Bearbeiten → Ernte → Wiederaufnehmen → Archiv → Löschen), zusätzlich `routing`, `app`, `mobile` grün; tsc und eslint sauber.
- **Produktion geprüft (Build 26102402):** Migration 0020 von Hand per SQL eingespielt (der vorhandene Grow bekam Phasendatum und Status; sein Sortenname bleibt leer, da früher nie gespeichert). Mit zwei Testkonten per HTTP: Anlegen mit Startdatum (Tag 10), Phase mit Datum, PATCH (unbekanntes Feld 400, fremder Grow 404), Ernte (100 %, Gewichte), Phase nach Ernte 409, Profil-Statistik „Ernten“ = 1, Wiederaufnehmen, Archivieren/Zurückholen, Abbruch verwirft Gewichte, fremdes Löschen 204 ohne Wirkung, eigenes Löschen 204, danach 404, wiederholt 204; Testkonten gelöscht.
- **Nicht geprüft:** Bedienung auf einem echten Handy. Runde 2 ist mit B-85 umgesetzt.

### B-83 – PDF-Vorschau: Zoom per Geste · neue Versionen

**Versionen (Vorgabe des Eigners):** Frontend „Ruderalis“ 0.1.1 → **0.1.2**, Backend 0.0.2 → **0.0.3** (`version.json`, abgeleitete Dateien per `npm run version:sync`). Sie fassen B-81 und B-82 zusammen.

- **Zoom per Geste:** In der PDF-Vorschau zoomt jetzt der **Zwei-Finger-Pinch** (auch beim Scrollen mit einem Finger bleibt alles wie bisher), der **Doppeltipp** (2,5× bzw. zurück auf Seitenbreite) und auf dem Computer **Strg + Mausrad** bzw. der Pinch am Touchpad. Während der Geste wird nur skaliert (flüssig), beim Loslassen werden die Seiten scharf neu gezeichnet; der Punkt unter den Fingern bleibt dabei an seiner Stelle. Die Symbole und die Tasten +/− bleiben. Der Zoom reicht jetzt von 1× bis **4×** (vorher 3×).
- **Tests:** Vitest +3 (Pinch mit Begrenzung nach oben und unten, Doppeltipp und Wischen, Strg+Rad), E2E-Schritt im PDF-Test (Berührungsereignisse im echten Browser: Seite wird breiter, Scrollstand verschiebt sich zum Fixpunkt).
- **Grenze:** Die Gesten sind mit synthetischen Berührungsereignissen geprüft, nicht mit einem echten Handy; die Rückmeldung des Eigners steht aus.

### B-78 – Ersetzte und verwaiste Bilder werden automatisch gelöscht

- **Ersetzen:** `PATCH /auth/me` löscht das bisherige Avatar-/Titelbild (Datenbankzeile **und** Bucket-Objekt), sobald ein anderes gesetzt oder das Bild entfernt wird – aber nur, wenn es dem Nutzer gehört, ein eigener Upload ist (`/media/<id>`, keine externe URL) und **nirgends mehr verwendet** wird (geprüft über alle Bildspalten: Profil, Anbieter, Hall of Fame, Grows, Foto-Galerie, Beiträge, Chat-Gruppen, Nachrichten). Fehler beim Löschen machen das Speichern nie rückgängig.
- **Verwaiste Bilder:** Neuer Cron `GET /api/cron/media-cleanup` (täglich 03:30 UTC, gleiche `CRON_SECRET`-Absicherung wie der Wochenreport, ohne Secret 404) entfernt Bilder, die **älter als 24 h** und nirgends verwendet sind (abgebrochene Uploads, gelöschte Beiträge/Nachrichten). Frische Uploads bleiben, damit ein offener Dialog nie sein Bild verliert. Pro Lauf höchstens 200.
- **Absicherung:** Die Liste `MEDIA_REFERENCES` (`lib/media-cleanup.ts`) muss jede neue Bildspalte enthalten; ein Test vergleicht sie mit dem Schema und schlägt bei einer vergessenen Spalte fehl.
- **Tests:** `media-cleanup.integration.test.ts` (7): Avatar ersetzen, Titelbild entfernen und gleiche Werte, Bild an anderer Stelle weiter verwendet, fremde Bilder/externe URLs unberührt, Aufräumlauf (alt/frisch/verwendet), Cron 404/401/200, Schema-Abdeckung.
- **Grenzen:** Selbst gehostet ohne Scheduler läuft das Aufräumen nur, wenn `/cron/media-cleanup` von außen aufgerufen wird; das Ersetzen funktioniert immer. Beim Löschen eines Beitrags/Chat-Bilds wird das Bild erst vom nächsten Lauf (nach 24 h) entfernt. Konto löschen (B-74) soll alle Bilder sofort entfernen.

### B-82 – Chat: Medien nur mit Login, PDF-Vorschau, Nachrichten löschen

Versionen unverändert (Eigner vergibt), nur die Build-Nummer wurde aktualisiert. **Migration `0019_media_access_message_delete.sql`** (`media.conversation_id`, `messages.deleted_at`, Rückfüllung der Chat-Zuordnung) muss vor dem Deploy eingespielt sein (`SKIP_MIGRATIONS=true` auf Vercel; idempotent). Außerdem behoben: `no-control-regex` in `media-files.ts` (CI-Lint von B-81 war rot).

- **Medien nur mit Login:** `GET /api/media/:id` antwortet ohne Sitzung mit 401 – für alle Bilder (Avatare, Titelbilder, Forum, Marktplatz, Chat). Bilder im Browser laden weiter, weil das Sitzungs-Cookie bei `<img>` mitgeschickt wird. Chat-Anhänge sieht nur, wer Mitglied der Unterhaltung ist (sowie der Eigentümer); alle anderen bekommen 404. `GET /api/media/config` bleibt öffentlich.
- **PDF-Vorschau:** PDF-Karten haben „ansehen“ (Vollbild-Dialog mit allen Seiten als Bildern, Zoom 1–4×, Seitenanzeige, Download, Esc) und daneben einen Download-Pfeil. Gerendert wird mit pdf.js 4.10 (Legacy-Build, wird erst beim Öffnen geladen; der Worker wird vom Bundler als eigene Datei ausgeliefert), Seiten werden erst beim Heranscrollen gezeichnet, Bildgröße ≤ ca. 3000 px. Die Bytes kommen über `GET /media/:id?raw=1` (nur PDF, sonst 400; gestreamt, `private, no-store`, CSP-Sandbox) – ein Abruf über den signierten Bucket-Link scheitert am fehlenden CORS. Beschädigte oder geschützte PDFs zeigen einen Hinweis mit Download.
- **Nachrichten löschen:** Papierkorb in der Nachrichtenzeile (Mauszeiger/auf Touch dezent sichtbar) → Bestätigung „Für alle löschen“. Absender dürfen jederzeit, **Gruppen-Admins** auch fremde Nachrichten. Es bleibt ein Platzhalter („🚫 Du hast diese Nachricht gelöscht“ / „Diese Nachricht wurde gelöscht“), Text und Anhänge sind weg; Medien werden vom Server und aus dem Bucket entfernt, sofern sie nirgends sonst verwendet werden; die Chatliste zeigt „🚫 Nachricht gelöscht“. Beim Empfänger erscheint der Platzhalter live (Ereignis `chat.message` mit `deleted`). Systemzeilen sind nicht löschbar (400), Wiederholen ist harmlos (204).
- **Tests:** Vitest 274 (neu: `PdfViewer.test.tsx`, PDF-Karten, Mock-Löschen), API 276 (neu: `media-access.integration.test.ts` 8 Tests – 401 ohne Login, Nicht-Mitglied 404, `?raw=1` aus Datenbank und Bucket, Nicht-PDF 400, Rückfüllung 0019, Löschen als Absender/Admin/Fremder/System, Wiederholen, Medien weg; angepasst: `chat-attachments`, `media-storage`, `security`), E2E `chat-attachments.spec.ts` (Mehrseiten-PDF wirklich gezeichnet, 401 ohne Cookie, Löschen mit Abbrechen/Bestätigen, Platzhalter live beim Empfänger, Datei danach 404). Die E2E-Testdateien (PNG, 3-seitiges PDF) werden jetzt zur Laufzeit erzeugt statt aus `/tmp` erwartet.
- **Tests unter `tests/`:** Alle Tests liegen jetzt in `tests/{unit,api,e2e}` (Unit spiegelt `src/`, Importe über `@/…`); Konfigurationen, CI und Doku sind angepasst, Befehle (`npm test`, `npm run test:api`, `npm run test:e2e`) unverändert.
- **Bekannte Grenzen:** Beim Medienabruf wird kein Verlauf-/Privatthema-Filter geprüft (Mitglied sieht alle Anhänge der Unterhaltung, auch aus Zeiträumen vor dem Beitritt). Der signierte Bucket-Link gilt 1 h und funktioniert für jeden, der ihn hat (wie ein Bearer-Link). Bei `COOKIE_SAMESITE=none` braucht der Browser ein partitioniertes Cookie, sonst fehlt es bei `<img>`. Ein bereits zugestellter Push lässt sich nicht zurückholen. Wird ein Medium in Chat **und** Profil gleichzeitig verwendet, sehen es nur Chat-Mitglieder. Kein Virenscan (ClamAV erst mit eigenem Hosting, `TODO.md`).

### B-81 – Chat: Bildvorschau, Dateien und mehrere Anhänge

Versionen unverändert (Eigner vergibt), nur die Build-Nummer wurde aktualisiert. **Migration `0018_chat_attachments.sql`** (`media.file_name`, `messages.attachments`) muss vor dem Deploy eingespielt sein (`SKIP_MIGRATIONS=true` auf Vercel; idempotent).

- **Bildvorschau:** Ein Bild im Chat lässt sich antippen und öffnet die Vollbild-Galerie (vorhandene `SwipeLightbox`): durch **alle Bilder des Verlaufs** wischen oder mit ←/→ blättern, Doppeltipp-Zoom, nach unten wischen schließt, Absender · Datum · Text als Beschriftung, „Bild speichern“ (`/media/<id>?download=1`). Bilder erscheinen im Raster (1 groß, 2–4 Kacheln, ab 5 „+N“).
- **Dateien senden:** Büroklammer → „Foto“ oder „Datei“ (Mehrfachauswahl); auch Einfügen (Strg+V) und Hineinziehen. Erlaubt per Positivliste: PDF, Word, Excel, PowerPoint, OpenDocument, RTF, TXT, CSV, MD, ZIP. Der Server prüft **Endung und Inhalt** (Magic Bytes, Textdateien ohne Binärzeichen); kein HTML/SVG/Programm. Dateien erscheinen als Karte (Symbol, Name, Größe, Typ) und laden **immer als Download** (`Content-Disposition: attachment`, bei Bucket-Speicher im signierten Link, `nosniff`).
- **Mehrere Anhänge:** bis zu 10 je Nachricht, optional mit Text. Ablage über der Eingabezeile mit Vorschau, Fortschritt, Fehler je Anhang (wiederholen/entfernen); Hochladen nacheinander, Senden erst, wenn alles hochgeladen ist. Der Server holt Art, Name und Größe aus der Datenbank (nicht vom Client) und akzeptiert nur **eigene** Uploads.
- **Grenzen konfigurierbar:** `UPLOAD_MAX_MB` (Standard: **4 auf Vercel**, hart auf 4,4 MB begrenzt wegen der Plattformgrenze von ca. 4,5 MB; **50 auf eigenem Host**) und `MEDIA_QUOTA_MB` (Standard 100 bzw. 1000). Die Oberfläche liest die Grenzen über `GET /api/media/config`. Auf Vercel werden Bilder immer verkleinert (1600 px); auf eigenem Host erscheint **SD/HD** (HD: bis 4096 px, JPEG 0,92; EXIF/GPS wird auch dort entfernt). Die Wahl wird im Browser gemerkt.
- **Liste und Push:** Vorschau „📷 3 Bilder“, „📎 Plan.pdf“, „📎 2 Anhänge“; Push-Text „Bild“ bzw. „Datei“. Ältere Nachrichten mit nur `image_url` erscheinen als einzelnes Bild. Anhänge zählen als „verwendet“: die Bereinigung (B-78) löscht sie nicht (`MEDIA_REFERENCES` um `messages.attachments` ergänzt).
- **Tests:** Vitest 265 (neu: `files.test.ts`, `chat-attachments.test.tsx`), API 268 (neu: `chat-attachments.integration.test.ts`: Typ-/Inhaltsprüfung, Größe, Download-Kopfzeilen mit Datenbank und Bucket, mehrere Anhänge, fremde/unbekannte/zu viele Anhänge, Bereinigung), E2E `e2e/chat-attachments.spec.ts` (zwei Nutzer live: Bilder + PDF senden, Vorschau mit Blättern und Speichern, Datei-Download, abgelehnte `.exe`; Handy-Ansicht).
- **Bekannte Grenzen:** *(mit B-82 behoben: Login-Pflicht, PDF-Vorschau, Nachrichten löschen)* Kein Virenscan (ZIP-Inhalt ist Sache der Anwender).

### B-80 – Pull-to-Refresh, Update-Zwang, Chat: Emoji und Bild senden

Versionen unverändert (Eigner vergibt), nur die Build-Nummer wurde aktualisiert.

- **„X Bereiche konnten nicht geladen werden“:** Das Dashboard lud den Seed-Ticker (`/offers`) auch bei ausgeschaltetem Marktplatz; der Server antwortet dann mit 403, und jeder Pull-to-Refresh meldete einen Bereich als gescheitert (in Produktion gemessen: `/offers`, `/products`, `/hall`, `/strains`, `/communities`, `/social/posts` → 403). Jetzt: Ticker und Abruf nur bei aktivem Marktplatz (`useSeedOffers(enabled)`), und ein 403 gilt beim Aktualisieren nicht mehr als Ausfall (`useResource`).
- **Weniger Spitzen:** Der Browser sendet höchstens 4 Anfragen gleichzeitig (`src/lib/api.ts`, Warteschlange), lesende Anfragen werden bei 500/502 einmal wiederholt (nicht bei 403/503, nicht beim Schreiben). Hintergrund: Der Datenbank-Pooler ist klein (B-77/B-79).
- **Update ohne Rückfrage:** Pull-to-Refresh installierte ein gefundenes Update in jedem Modus außer „Nur Hinweis“, also auch im Standardmodus „Nachfragen“. Jetzt nur noch im Modus „Automatisch“ (`pullRefreshUpdate`), sonst erscheint ein Hinweis (Banner, Menü, Einstellungen).
- **Emoji-Schaltfläche im Chat:** Die Auswahl öffnete nach unten, also unter dem Bildschirmrand (Eingabezeile sitzt unten). `Popover` hat jetzt `side="top"`; im Chat öffnet sie nach oben und rechtsbündig.
- **Bild senden – „Interner Fehler“:** Reproduziert in Produktion: Der **erste Upload nach ~95 s Pause hing > 12 s** (503 `DB_TIMEOUT`), Uploads direkt danach liefen in 0,3–1,7 s. Eingegrenzt über eine Diagnose-Stufe in der 503-Antwort (`phase`, `apps/api/src/lib/phase.ts`): Es war **nicht der Bucket**, sondern die erste Datenbank-Abfrage der Upload-Route (Kontingent-Zählung) auf einer Verbindung, die nach der Pause tot war. Fix: hängt diese Abfrage länger als 4 s, wird die Verbindung verworfen und einmal neu versucht (Antwort trägt `X-Db-Retry: 1`); gemessen nach 95 s Pause: 201 nach 4,7 s statt 503 nach 12 s, der nächste Upload 0,4 s. Außerdem: Bucket-Zugriff ohne Keep-Alive, Zeitlimits 3 s/6 s, beide Versuche zusammen höchstens 9 s (vorsorglich, war nicht die Ursache). Im Browser wird Upload (und lesende Anfragen) bei 500/502/503 einmal wiederholt; verständliche statt roher Meldungen.
- **Tests:** Vitest 249 (neu: Parallelität/Wiederholung in `api.test.ts`, 403 in `refresh-all.test.tsx`, `pullRefreshUpdate`, `emoji-picker.test.tsx`); API 255/255; typecheck und lint ohne Fehler.
- **Nicht geprüft:** Emoji-Auswahl und Pull-to-Refresh wurden nicht im Browser angesehen (nur Komponententests). Offen: dieselbe tote Verbindung nach Pausen könnte auch andere Routen treffen (bisher nur beim Upload gesehen).

### B-79 – Laden hängt / „Zeitlimit der Anfrage erreicht“: Datenbankverbindung nach jeder Anfrage freigeben

Versionen unverändert (Eigner vergibt), nur die Build-Nummer wurde aktualisiert.

- **Befund (Produktion, gemessen):** Anfragen mit Datenbankzugriff (`/api/features`, `/api/forum/threads`) hingen ≥ 20–30 s, `/api/version` (ohne Datenbank) antwortete in 0,2 s. In Supabase standen genau 5 Pooler-Sitzungen, alle „idle“ (Abfragen fertig), und blieben Minuten stehen. Eingefrorene Vercel-Instanzen führen keine Timer aus, `idle_timeout` greift dort nie: Jede Instanz hielt ihre Sitzung fest, bis der Session-Pooler voll war; neue Instanzen warteten auf eine freie Sitzung. Die eigene Abfrage-Schleife des Browsers (Benachrichtigungen, ungelesene Chats) belegt dabei laufend Instanzen.
- **Änderung:** `apps/api/src/db/client.ts` baut die Verbindung austauschbar auf (`resetDbConnection()`; `db` und `client` bleiben stabile Verweise). `src/server/embedded-api.ts` gibt die Verbindung auf Vercel frei, sobald die letzte laufende Anfrage der Instanz fertig ist, und setzt ein Zeitlimit von 12 s je Anfrage: danach wird die Verbindung hart verworfen und die Antwort ist 503 `{ code: "DB_TIMEOUT" }` (klare Meldung statt Hängen). Self-Host/Docker (keine `VERCEL`-Variable) behalten Pool und `LISTEN`-Verbindung unverändert.
- **Preis:** Jede Anfrage baut die Verbindung neu auf (Pooler-Anmeldung), geschätzt +50–150 ms; gemessen in Produktion: siehe B-86b (Datenbank ≈ 10–70 ms je Anfrage).
- **Tests:** API `db-reset.integration.test.ts` (3: Abfragen nach Zurücksetzen, hartes Zurücksetzen bricht hängende Abfrage ab, Transaktion); gesamt API 255/255. Lokal mit `VERCEL=1` gestartetem Server: 13 Anfragen (davon 10 parallel) → alle 200, danach 0 offene Datenbankverbindungen.
- **Nicht geprüft:** Das 12-s-Zeitlimit selbst nur per Code-Lesung (kein künstlich hängender Pooler im Test).

### B-77 – „Interner Fehler“ im Profil: Pooler-Sitzungen blockiert

- **Ursache (belegt):** Der Supabase-Session-Pooler hat ca. 16 Hintergrundverbindungen. Vercel-Instanzen (je `DB_POOL_MAX=3`) halten Sitzungen auch eingefroren weiter fest; waren alle belegt, scheiterten Anfragen, die mehrere Verbindungen brauchen (`GET/PATCH /auth/me`, `/members/…`, Anmeldung), sofort mit 500, einfache Abfragen liefen weiter. Nachweis in Produktion: `/auth/me` 500 bei jedem Aufruf (auch nach 45 s Wartezeit); nach dem Beenden der 16 Pooler-Sitzungen (`pg_terminate_backend`) sofort 6× 200.
- **Änderungen:** `DB_POOL_MAX=1` in Produktion (eine Verbindung je Instanz), Leerlauf 10 s statt 20 s, `max_lifetime` 5 min. Der 500-Antwort wird zusätzlich nur der Treiber-Code (`code`, z. B. `XX000`) beigefügt, damit die Ursache ohne Laufzeitprotokoll sichtbar ist (kein SQL, keine Daten).
- **Nachtest:** Mit `DB_POOL_MAX=1` scheiterten bei 20 gleichzeitigen Anfragen weiterhin rund die Hälfte (Antwort `code: "XX000"` = Pooler „max clients reached“): Vercel startet je gleichzeitiger Anfrage eine neue Instanz, jede nimmt eine Pooler-Sitzung. Der Session-Pooler reicht dafür nicht.
- **Versuch Transaction-Pooler (gescheitert, zurückgenommen):** `DATABASE_URL` auf Port 6543 mit `prepare: false` und ohne Startparameter. In Produktion hing danach **jede** Datenbankabfrage (Timeout 15–30 s; in Supabase eine Abfrage „aktiv“, die auf den Client wartet) – Produktion war einige Minuten unbenutzbar, bis `DATABASE_URL` zurück auf 5432 gesetzt wurde. Der Code dafür (`client-options.ts`) wurde wieder entfernt. Gegen den echten Pooler war nichts vorab getestet: künftig erst in einem eigenen Test-Deploy prüfen.
- **Stand:** Session-Pooler, `DB_POOL_MAX=1`, Leerlauf 10 s, `max_lifetime` 5 min. Unter vielen gleichzeitigen Anfragen bleiben vereinzelte 500er (`code: XX000`) möglich; endgültig gelöst wird das mit dem geplanten Umzug auf eigene Infrastruktur.
- **Weiterer Befund:** Beim Ersetzen von Avatar/Titelbild bleibt das alte Bild im Bucket liegen (Waisen); Aufräumen steht in `TODO.md`.

### B-76 – Bilder in Supabase Storage (S3) und Titelbild im Profil

Versionen unverändert (Eigner vergibt), nur die Build-Nummer wurde aktualisiert.

- **Speicher:** Neue Variable `MEDIA_STORAGE` (`database` Standard / `s3`). Mit `s3` legt `POST /media` die Bytes serverseitig (nach der Magic-Byte-Prüfung) in den **privaten** Bucket `grow-obs` (`media/<nutzer>/<id>`); die Datenbank hält nur Metadaten (Größe, Typ, Besitzer, Schlüssel) und weiter die Quote (200 Bilder/100 MB). Der Verweis `/media/<id>` bleibt unverändert, `GET /media/:id` leitet auf einen **signierten Link (1 h)** um, die Weiterleitung bleibt 30 min im Browser. `DELETE` löscht Zeile und Objekt. Fällt der Speicher aus: 502 mit Klartext, keine Zeile, keine Details im Protokoll. Bewusst kein Automatismus: S3-Zugangsdaten allein ändern nie, wo Bilder landen (Standard bleibt PostgreSQL, damit Docker/Embedded unverändert laufen).
- **Titelbild:** `users.cover_url`, `PATCH /auth/me { cover }` (eigener Upload oder HTTPS), Auswahl in „Profil bearbeiten“, Banner im eigenen Profil und auf `/u/<name>`. Bei eingeschränkter Sichtbarkeit wird es wie Bio und Co. nicht ausgeliefert.
- **Migration `0017`** (idempotent, von Hand einspielbar): `media.data` nullable, `media.storage_key`, Prüfregel „Bytes oder Schlüssel“, `users.cover_url`.
- **Client-Optionen:** Prüfsummen nur noch, wenn das Protokoll sie verlangt (`WHEN_REQUIRED`), damit S3-kompatible Dienste die Anfragen annehmen.
- **Geprüft gegen den echten Bucket** (Supabase, `eu-west-1`): Bucket-Check, Upload, signierter Link (200, Typ `image/png`), Link ohne Signatur 403, Löschen, danach Link ≥ 400 – mit dem echten `s3.ts`.
- **Tests:** Neu: API `media-storage.integration.test.ts` (7: Ablage im Bucket, Weiterleitung, Format-Prüfung, 502, Löschen/fremde Bilder, Titelbild, Sichtbarkeit), Umgebung (`MEDIA_STORAGE`), Migration 0017, E2E Titelbild hochladen/ansehen/entfernen. Gemessen: API 245/245 (18 Dateien), Vitest 243/243, Lint/Typecheck sauber, Playwright Profil-Spec 3/3.
- **Nicht geprüft:** Produktion (Variablen und Migrationen 0016/0017 werden beim Deploy gesetzt); Bilder anderer Quellen als `POST /media` (Grow-Fotos über `/media` laufen automatisch mit). Beim Löschen eines Kontos bleiben Objekte im Bucket – das gehört in B-74 (Konto löschen).
- **Hinweis Zugangsdaten:** Der Secret Key stand im Chat. Nach Einrichtung in Supabase rotieren (Storage → S3-Zugangsdaten) und `S3_SECRET_KEY` in Vercel erneuern.

### B-73 – Profil, Runde 1: Profilfelder, Sichtbarkeit, Folgen, Mitgliedsseiten

Versionen unverändert (Eigner vergibt), nur die Build-Nummer wurde aktualisiert. Erste von drei Profil-Runden (B-74 Konto, B-75 Benachrichtigungen; Bilder erst mit Supabase Storage).

- **Profilfelder:** Über mich (≤ 280), Ort (≤ 60), „Anbau seit“ (Jahr 1990 bis heute), Medium (Erde/Coco/Hydro/Gemischt), bis zu 5 Interessen aus fester Liste; Benutzername änderbar, höchstens 1× je 30 Tage (3–32 Zeichen, Buchstaben/Zahlen/`_`). Migration `0016` (idempotent, von Hand einspielbar). Listen stehen in `profile-fields.ts` (Frontend und Backend, ein Test hält sie gleich).
- **Sichtbarkeit:** Alle / Nur Follower / Niemand (Karte „Privatsphäre“ in den Einstellungen). Der Server schneidet ein eingeschränktes Profil auf Name, Bild und Titel zu. **„Alle“ meint angemeldete Mitglieder** (Annahme, keine Besucher ohne Konto).
- **Folgen mit Bestätigung (echt, Tabelle `follows`):** bei „Alle“ sofort, bei „Nur Follower“ als Anfrage (Annehmen/Ablehnen in der Karte „Follower-Anfragen“), bei „Niemand“ nicht möglich. Entfolgen, Follower entfernen, Listen Follower/Folgt. Wechsel auf „Alle“ nimmt offene Anfragen an, auf „Niemand“ löscht sie (bestehende Follower bleiben). Benachrichtigungen als Typ `system` mit Link zum Profil.
- **Mitgliedsseite `/u/<benutzername>`:** neue Ansicht `member` (Direktlink, Service-Worker-Liste, 404 bei unsicherem Namen). Sprung dorthin aus Gruppen-Mitgliederliste und dem Info-Knopf im Direktchat (neu: `partnerHandle` in der Konversationsliste). Forum-Autoren sind noch nicht verlinkt (die Forum-API liefert keinen Benutzernamen; Forum blieb unangetastet).
- **Nur Echtes:** Level-Abzeichen und „Master Grower“ entfernt (Seitenleiste, Profil, Demo-Daten), Statistik aus der Datenbank: Grows, Ernten, Follower, Folgt.
- **Kleinigkeit:** `Chip` akzeptiert alle Button-Attribute (`disabled`).
- **Tests:** Neu: API `members.integration.test.ts` (8), Migration 0016, Vitest `members.test.tsx` (8), `profile-fields.test.ts`, Routen `/u/<handle>`, E2E `profiles.spec.ts` (2: Profil ausfüllen, Anfrage, Bestätigung, Entfolgen; Benutzername-Sperre, unbekanntes Profil). Gemessen (Build 26102300): Vitest 243/243 (40 Dateien), API 236/236 (17 Dateien), Lint/Typecheck/Build sauber, Playwright: Desktop-Gesamtlauf 45 bestanden (2 Realtime-Tests scheiterten an einem Selektor-Konflikt mit meinem neuen Knopf, behoben und mit Gruppen-Test erneut bestanden), Mobile 5/5.
- **Nicht geprüft:** Produktion (Migration `0016` muss vor dem Deploy von Hand eingespielt werden, `SKIP_MIGRATIONS=true`); Bild-Upload (Avatar/Titelbild) bleibt bis Supabase Storage offen.

### B-72 – Schalter mit langem Beschreibungstext nicht mehr gequetscht

- **Fehler:** In Einstellungen waren „Animationen reduzieren“, „Sounds“ (und „Wochenreport“) als schmale, verzerrte Schalter zu sehen, „Partikel-Effekte“ dagegen korrekt. Ursache: `Toggle` war ein Flex-Kind ohne `shrink-0`; bei langem Beschreibungstext schrumpfte der Schalter. Gemessen auf 390 px Breite vorher 27 px / 25 px, nachher 44 px (Soll `w-11`).
- **Fix:** `Toggle` bekommt `shrink-0` (wirkt in allen Zeilen, auch Gruppen-Themen, Push, Telegram); der Textblock in `ToggleRow` bekommt `min-w-0`.
- **Geprüft:** Demo-Modus im Browser (390 px), Schalterbreite vorher/nachher gemessen. Nicht neu gelaufen: Vitest/E2E (reine CSS-Klassen).

### B-71 – Profil und Einstellungen: nur Echtes, drei Einstellungen mit Wirkung

Versionen unverändert (Eigner vergibt), nur die Build-Nummer wurde aktualisiert. Auftrag des Eigners: erst Profil/Einstellungen, danach Grows/Tagebuch (offen, siehe `TODO.md`).

- **Abzeichen entfernt:** Die sechs festen Abzeichen („1k Follower“, „100 Tage Streak“ …) waren für jedes Konto gleich und erfunden. Das Profil zeigt nur noch echte Daten (Grows, Ernten, Follower, letzte Aktivität). Abzeichen aus echten Daten bleiben eine spätere Option.
- **Animationen reduzieren (wirkt jetzt):** Schalter in „Darstellung“, nur dieses Gerät (`localStorage` `go-reduce-motion`). Ohne eigene Wahl gilt die Systemeinstellung (`prefers-reduced-motion`); eine eigene Wahl „aus“ überstimmt sie. Setzt `html[data-reduce-motion]`, die CSS-Regeln und Framer Motion (`MotionConfig reducedMotion`); vorher zeigte der Schalter nur einen Hinweis, und Framer Motion ignorierte die Systemeinstellung.
- **Sounds (wirken jetzt):** Schalter in „Darstellung“, nur dieses Gerät, standardmäßig aus (`go-sound`). Beim Einschalten spielt ein Hörprobe-Ton (das entsperrt zugleich die Audioausgabe des Browsers). Danach kurzer Ton (Web Audio, kein Audio-Asset), wenn die Zahl ungelesener Meldungen oder Chat-Nachrichten steigt, solange die App sichtbar ist (`SoundBridge`, `src/lib/sound.ts`). Kein Ton beim Laden; kein Ton für Nachrichten in einem gerade offenen Chat, die sofort als gelesen gelten.
- **Wochenreport (wirkt jetzt):** Schalter in „Benachrichtigungen“, Opt-in (Standard aus, Annahme: keine ungefragten Meldungen), serverseitig je Konto (Migration `0015`, `users.weekly_report`, `weekly_report_week`). `GET /api/cron/weekly-report` (nur mit `CRON_SECRET`, sonst 404; Bearer, zeitkonstanter Vergleich) sendet je ISO-Woche (Europe/Berlin) genau einmal eine Meldung `grow` (mit Push, wenn aktiv): je Grow Tag seit Start, Phase und Einträge der letzten 7 Tage (bis 4 Grows, dann „… und N weitere“). Konten ohne Grow bekommen nichts. Die Woche wird je Konto atomar reserviert (kein Doppelversand bei parallelen Aufrufen). `vercel.json` richtet Vercel Cron `0 17 * * 0` ein (Sonntag 17:00 UTC = 18:00 MEZ / 19:00 MESZ; Hobby-Plan etwa ±1 Stunde ungenau). **Damit es auf Vercel läuft, muss `CRON_SECRET` (≥ 16 Zeichen) im Projekt gesetzt sein**, sonst antwortet der Aufruf mit 404; im Demo-Modus ist der Schalter gesperrt.
- **Telegram-Bot-Schalter entfernt:** Er speicherte nichts und löste nichts aus (Annahme des Agenten; nicht ausdrücklich beauftragt). Zurück erst zusammen mit einer echten Bot-Anbindung.
- **Nebenbei:** `Toggle` hat `disabled`; `useChatUnreadState` liefert zusätzlich `loaded`.
- **Tests:** Neu: API `weekly-report.integration.test.ts` (6: ISO-Woche inkl. Jahreswechsel/Sonntagabend, Tagesberechnung und Text, Einstellung per `PATCH /auth/me`, Versand nur an Opt-in mit Grow und einmal je Woche, Cron-Endpunkt ohne Secret 404 / falsch 401 / richtig 200); Vitest `sound.test.ts` (2); E2E `settings.spec.ts` (2: keine Abzeichen, kein Telegram-Schalter, Einstellungen bleiben nach Neuladen; Systemvorgabe „weniger Bewegung“ und eigene Wahl).
- **Geprüft:** typecheck ✅ · lint ✅ · Vitest 232/232 · API 227/227 (Sandbox wurde zwischendurch zurückgesetzt; `node_modules`, PostgreSQL und Playwright neu installiert) · Build ✅ · E2E 45 bestanden, 1 übersprungen (vollständiger Lauf, 6,8 min).
- **Nicht geprüft:** echter Versand des Wochenreports (Vercel Cron, `CRON_SECRET` nicht gesetzt, Push auf echten Geräten), Töne auf echten Geräten (Autoplay-Regeln, iOS), `apps/api`-Typecheck separat (der Haupt-Typecheck bindet die API über die eingebettete Route ein), die Migration `0015` auf der Supabase-Datenbank (wird beim ersten Start der neuen Version automatisch angewendet, sofern `SKIP_MIGRATIONS` nicht `true` ist; sonst `npm run db:migrate`).

### B-70 – Chat: Kopieren und Sendefehler; kürzere Seiten auf dem Telefon

Versionen unverändert (Eigner vergibt), nur die Build-Nummer wurde aktualisiert. Umgesetzt wurden die Gruppen A und B der Vorschlagsliste; Gruppe C (Wischaktionen in der Chatliste, Scroll-Position beim Zurück, Offline-Hinweis, 44-px-Schalter, Kontrast-/Tastaturprüfung) ist vom Eigner auf später verschoben.

- **A1 Nachricht kopieren:** Seit B-68 lässt sich Text nicht mehr markieren. Jede Blase mit Text hat unten rechts einen Kopieren-Knopf (`aria-label` „Nachricht kopieren“; am Desktop bei Hover/Fokus sichtbar, auf Touch-Geräten immer, Trefferfläche ≈ 40 px). Hinweis „Nachricht kopiert“. `src/lib/clipboard.ts`: `navigator.clipboard`, sonst `execCommand`-Fallback. Kein langes Drücken.
- **A2 Sendefehler sichtbar:** Statt nur eines Toasts steht über dem Eingabefeld ein Hinweis (`role="alert"`) mit Grund, „Erneut senden“ und „Verwerfen“. Er bleibt, bis erneut gesendet, verworfen oder die Unterhaltung/das Thema gewechselt wird. Der Text bleibt im Eingabefeld; nach Erfolg wird das Feld nur geleert, wenn es noch dieselbe Nachricht enthält (nichts zwischenzeitlich Getipptes geht verloren). Kein automatisches Wiederholen (Gefahr doppelter Nachrichten). `src/lib/chat-errors.ts` übersetzt „API nicht erreichbar“/„Failed to fetch“ (→ „Keine Verbindung zum Server …“), den generischen „Interner Fehler“ (→ „Der Server hatte kurz ein Problem …“) und Rate-Limits.
- **A3 Querformat-Dialog:** Das Problem (Klick auf die Person im Dialog „Neue Nachricht“ bei 740×360 traf den Hintergrund) war in drei Varianten nicht reproduzierbar (direkter Aufruf, Aufruf über „Mehr“, Drehen bei offenem Dialog); der Klick klappt, wenn man auf die Suchergebnisse wartet. Wahrscheinliche Ursache: Der vertikal zentrierte Dialog wächst mit den Treffern und verschiebt sich dabei unter dem Finger. Deshalb sitzt `Modal` jetzt bei Bildschirmhöhe ≤ 480 px oben (`items-start`) statt zentriert. Ursache nicht belegt.
- **B1 Einklappbare Einstellungen:** Neue Komponente `CollapsibleCard` (`src/components/ui.tsx`). Unter 1024 px: Überschrift als Schaltfläche (`aria-expanded`, `aria-controls`, Pfeil), standardmäßig zu; ab 1024 px immer offen. Angewendet auf Darstellung, Sprache & Währung, Benachrichtigungen, Konto, Gefahrenzone, App-Updates, Push, Sitzungen & Geräte, Passwort ändern, Anmeldeprotokoll. Der Inhalt bleibt im DOM (`hidden`). Gemessen bei 360 px: Einstellungen 3360 px → 1617 px Seitenhöhe.
- **B2 Dashboard:** Die dritte Kennzahl füllt auf dem Telefon die ganze Zeile (vorher Lücke neben „Ø Gesundheit“); „Aktivität“ und „Kosten-Snapshot“ sind auf dem Telefon einklappbar (standardmäßig zu); Leerzustände sind auf dem Telefon niedriger (`py-10` statt `py-14`, gilt für alle `EmptyState`). Gemessene Höhe nicht vergleichbar mit der alten Messung (andere Messmethode), daher keine Zahl.
- **B3 Kostenrechner/Planer:** Rechner: auf dem Telefon klebt eine Leiste „Gesamt / Mo.“ und „Pro Cycle“ unter der Kopfzeile, während die Regler benutzt werden (`data-testid="calc-sticky"`, ab 1024 px ausgeblendet). Planer: Sortenauswahl scrollt auf dem Telefon waagerecht statt umzubrechen; die drei Substrat-Karten sind ein waagerechtes Karussell (Snap) statt untereinander (ab 768 px unverändert Raster).
- **Nebenbei:** `useMediaQuery` fällt ohne `window.matchMedia` auf `false` zurück (Tests ohne Stub, sehr alte Browser).
- **Tests:** Neu: `src/lib/chat-errors.test.ts` (4), E2E mobil: Kopieren + Sendefehler mit „Erneut senden“ (Netzwerk per `route.abort`), Einstellungs-Gruppen/Rechner-Leiste/Dashboard-Überlauf/Dialog im Querformat.
- **Geprüft:** typecheck ✅ · lint ✅ · Vitest 230/230 ✅ · Build ✅ · E2E vollständiger Lauf: 41 bestanden, 1 übersprungen, 2 fehlgeschlagen: der neue Querformat-Test (Schwelle 20 px zu knapp, auf 40 px gesetzt) und ein Moderations-Test (`moderation.spec`, „Element nicht stabil“, lief parallel zu Vitest); beide danach einzeln und mit neuem Build grün. Kein zweiter vollständiger Lauf.
- **Nicht geprüft:** echte Geräte (Zwischenablage, Hover/Touch-Erkennung `pointer: coarse`, Karussell-Wischen), API-Tests (Backend unverändert), Kontrast, Tastaturbedienung der neuen Einklapp-Knöpfe nur per Rolle/`aria-expanded` getestet. Die Regler im Rechner brauchen weiterhin ≈ 100 px je Zeile.

### B-69 – Code-Audit und UI-Fehler

Versionen unverändert (Eigner vergibt), nur die Build-Nummer wurde aktualisiert.

- **Vorgehen:** Statische Prüfung (Muster wie `dangerouslySetInnerHTML`, `console.log`, rohes SQL, `any`, TODO; Authentifizierung aller API-Routen; `npm audit --omit=dev`) und ein automatischer Durchlauf aller 23 Pfade in vier Bildschirmgrößen (360×640, 393×727, 768×1024, 1280×800) mit Messung von Überlauf, Konsolenfehlern, Touch-Zielen, Beschriftungen und Eingabeschrift.
- **Statisch unauffällig:** keine `any`/`@ts-ignore`, kein `console.log` im Anwendungscode (nur CLI), einziges `dangerouslySetInnerHTML` ist das eigene Theme-Skript, alle Schreib-Routen der API hinter `requireAuth` (Sammel-Middleware oder je Route), `npm audit` ohne Funde (Produktionsabhängigkeiten).
- **Behoben (gefunden im Durchlauf):**
  - **Seitlicher Überlauf auf dem Telefon** in Profil → Einstellungen (59 px bei 360 px), Simulation (9 px) und Telegram (3 px). Ursache: Raster ohne Spaltenvorgabe (`grid gap-6 lg:grid-cols-2`) hat auf dem Telefon eine Spalte mit `min-content`-Breite. Globale Vorgabe `.grid { grid-template-columns: minmax(0, 1fr) }` in der Basis-Ebene (Tailwind-Klassen `grid-cols-*` überschreiben sie).
  - **Eingabefelder < 16 px** (iOS Safari zoomt beim Fokussieren; `user-scalable=no` wird dort teils ignoriert): auf Telefonbreite (< 768 px) mindestens 16 px.
  - **Beschriftungen:** sechs Schieberegler (Rechner, Simulation, Showcase) und der Emoji-Auswähler hatten keinen zugänglichen Namen (`aria-label`, `Popover` bekommt `label`).
  - **Bewertungssterne:** reine Anzeige ist jetzt `role="img"` mit Text („4,5 von 5 Sternen“) statt fünf deaktivierter Schaltflächen; bedienbar nur mit `onChange`, dort über die ganze Breite (vorher nur über dem gefüllten Teil, also bei Wert 0 nicht klickbar) und mit ≥ 44 px Trefferfläche.
  - **Touch-Ziele:** Filter-Chips mind. 40 px hoch auf dem Telefon (vorher 30 px), Schalter (`Toggle`) und die Links „Alle“/„Details“ im Dashboard mit größerer Trefferfläche.
  - **Avatar-Ring:** `ring-*` am Profilbild lag auf einem eckigen Rahmen (dunkles Quadrat hinter dem Kreis); der Rahmen ist jetzt rund.
  - **Seitentitel:** jede Ansicht setzt `document.title` („Chat · Grow|Observer“); vorher überall derselbe Titel.
- **Geprüft:** typecheck ✅ · lint ✅ · Vitest 226/226 (ein Lauf mit einem fehlgeschlagenen Test, zwei Wiederholungen grün; welcher Test, wurde nicht ermittelt) · Build ✅ · E2E 41 bestanden, 1 übersprungen (Desktop 38, mobil 3; neuer Test: Überlauf bei 360 px, Seitentitel, Eingabeschrift). Nicht ausgeführt: API-Tests.
- **Nicht behoben / offen:** Toggle-Höhe visuell weiterhin 24 px (nur die Trefferfläche wuchs); Dashboard/Planer/Showcase u. a. sind auf dem Telefon lang (kein Fehler); Ansicht „Report“ ohne Grow hat keine `h1`; Sterne im Showcase nur dort bedienbar. Keine Tests auf echten Geräten, kein Kontrast-/Tastaturtest, keine Lasttests.

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

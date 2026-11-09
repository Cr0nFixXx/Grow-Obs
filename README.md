# 🌿 Grow|Obs

Community-Grow-PWA: Grow-Tagebuch, Sorten- und Wissensdatenbank, Social-Feed, Forum, Chat und Communities mit Moderation –
als mobile-first Progressive Web App mit selbst gehostetem Backend.

- **Frontend:** Next.js 16 (clientseitige SPA-Hülle) · React 19 · TypeScript · Tailwind CSS v4 · Framer Motion
- **Backend:** Hono + Drizzle + PostgreSQL (`apps/api`), standardmäßig **eingebettet unter `/api`**; optional als eigener Docker-Dienst mit MinIO
- **Version und Stand:** Frontend „Ruderalis“, Backend getrennt versioniert (`version.json`); aktueller Stand und offene Punkte: [`HANDOFF.md`](./HANDOFF.md)
- **Kein Anspruch auf Produktionsreife.** Docker-Stack und Touch auf echten Geräten wurden noch nicht getestet.

---

## 🚀 Schnellstart

Voraussetzung: **Node 22**, PostgreSQL (für den API-Modus).

```bash
npm install
cp .env.example .env            # DATABASE_URL der eingebetteten API anpassen
echo 'JWT_SECRET=<zufälliger Wert>' >> .env.local   # Pflicht in Produktion (openssl rand -base64 48)
npm run dev                     # Entwicklung, http://localhost:3000 (Migrationen laufen beim ersten Request)
```

| Befehl | Zweck |
|---|---|
| `npm run dev` | Next.js-Dev-Server (Realtime fällt hier auf SSE zurück) |
| `npm run build` / `npm start` | Produktions-Build / Produktionsserver (`scripts/server.mjs`, mit WebSocket) |
| `npm run preview` | Vorschau: baut bei Bedarf, startet PostgreSQL/DB, serviert auf `0.0.0.0:3000` (`PREVIEW_REBUILD=1` erzwingt Build) |
| `npm run build:vite` | Legacy-Build als einzelne `dist/index.html` (ohne Typecheck, ohne API) |
| `npm run version:build` | Build-Nummer setzen (nach jeder abgeschlossenen Aufgabe) |
| `npm run admin:create --prefix apps/api -- --email … [--promote \| --reset-password]` | ersten Betreiber anlegen ([`apps/api/README.md`](./apps/api/README.md)) |

Prüfbefehle (Typecheck, Lint, Tests, E2E): [`docs/TESTING.md`](./docs/TESTING.md).

**Datenmodus** (`NEXT_PUBLIC_API_URL`, wird zur **Build-Zeit** eingebettet):

| Wert | Modus |
|---|---|
| nicht gesetzt | eingebettete API unter `/api`, Daten dauerhaft in PostgreSQL (Standard) |
| leer (`NEXT_PUBLIC_API_URL=`) | Demo-/Mock-Modus: kein Server nötig, Demo-Daten, nicht dauerhaft |
| `https://api.example.com` | externe API, z. B. der Docker-Stack (siehe unten) |

**Externes Backend (Docker):**

```bash
cd apps/api
cp .env.example .env     # JWT_SECRET, POSTGRES_PASSWORD, S3_SECRET_KEY mit getrennten Zufallswerten füllen
docker compose up --build
```

Frontend dafür bauen mit `NEXT_PUBLIC_API_URL=http://localhost:8787`. Details, Endpunkte und Sicherheit: [`apps/api/README.md`](./apps/api/README.md).

---

## ✨ Funktionen

- **Grow-Tagebuch** mit Phasen, Messwerten (Temperatur, Luftfeuchte, EC, pH, berechnetes VPD) mit weichen Diagrammen und Zielbereichen für pH/EC/VPD, Galerie mit Bildunterschriften und datierten Logs · **Sorten**, Breeder, Marktplatz, **Wiki** (editierbar)
- **Social:** Community-Feed, Forum (Votes, Antworten), Chat (live, „schreibt …“, Online-Status), Benachrichtigungen in Echtzeit
- **Communities:** öffentlich/privat, Einladungscode, Rollen, eigener Feed, Moderation (Ausblenden, Meldungen, Rauswurf/Sperre)
- **Konto:** Sitzungen und Geräteliste, Passwort ändern, Anmeldeprotokoll · Developer-Admin mit Feature-Flags, Health und Release-Notes
- **Tools:** Kostenrechner, Verbrauch, Simulation, Grow-Planung, Grow-Report (Druckansicht), KI-Assistent (derzeit nur Oberfläche)
- **PWA:** installierbar, Offline-Shell, Update-Hinweise · Light/Dark-Theme, Command-Palette (⌘K), Barrierefreiheit (ARIA, Tastatur, Reduced Motion)
- **Mobile-first:** Bottom-Sheets, Wischgesten, Pull-to-Refresh, Safe-Area · Design-System: [`DESIGN.md`](./DESIGN.md)

---

## 📁 Projektstruktur

```
app/            Next.js-Hülle: Layout, 404-Seite, Catch-All-Route, eingebettete API (/api)
src/            Frontend: views/, components/, services/ (Mock | API), data/ (Hooks), lib/, config/
apps/api/       Backend: Hono-API, Drizzle-Schema + Migrationen, Docker-Compose
tests/          alle Tests: unit/ (Vitest, spiegelt src/), api/ (Integration gegen PostgreSQL), e2e/ (Playwright)
scripts/        Server (WebSocket), Preview, Versionierung, Doku-Linkprüfung
promo/          Promo-Demo-Video (Szene als HTML, Render-Pipeline, Musik)
promo-kit/      Motion-Graphics-Promo-Kit (Engine, Szenen, Screenshots, Mockups, Brand, Briefing; nur Quellen)
.claude/skills/ Agent-Skills (projektspezifisch)
public/         Manifest, Icons, Service Worker
docs/           TESTING, CHANGELOG, PROGRESS, MILESTONES, skills/ (generisch), archive/
```

Vollständige Karte: [`HANDOFF.md`](./HANDOFF.md) §2 · Architektur: [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## 📚 Dokumentation

| Datei | Inhalt |
|---|---|
| [`HANDOFF.md`](./HANDOFF.md) | aktueller Stand, Repo-Karte, Fallstricke, offene Punkte (Einstieg für Agents) |
| [`CLAUDE.md`](./CLAUDE.md) | verbindliche Regeln für Agents |
| [`PLAN.md`](./PLAN.md) · [`TODO.md`](./TODO.md) | Roadmap und Beschlüsse · offene Aufgaben |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Schichten, Betriebsarten, Auth, Echtzeit, Moderation, Routing, Versionierung |
| [`DESIGN.md`](./DESIGN.md) | Design-System: Tokens, Komponenten, Bewegung, Layout-Fallen |
| [`apps/api/README.md`](./apps/api/README.md) | Backend-Betrieb und Endpunkt-Vertrag |
| [`docs/TESTING.md`](./docs/TESTING.md) | Teststand, Prüfbefehle, offene Release-Gates |
| [`docs/CHANGELOG.md`](./docs/CHANGELOG.md) | Änderungen je Aufgabe mit Messwerten |
| [`docs/PROGRESS.md`](./docs/PROGRESS.md) | Build-Protokoll: eine Zeile je Aufgabe |
| [`docs/MILESTONES.md`](./docs/MILESTONES.md) | Produktvision: Editionen, Datenschutz, Native Apps |
| [`promo/PROMODEMO.md`](./promo/PROMODEMO.md) | Promo-Demo-Video (Motion Graphics): Storyboard, Build, Hinweise |
| [`promo-kit/README.md`](./promo-kit/README.md) | Promo-Kit für andere Agenten: Briefing (`promo-kit/BRIEF.md`), Engine (`promo-kit/docs/ENGINE.md`), Werkzeuge |
| [`.claude/skills/`](./.claude/skills) · [`docs/skills/`](./docs/skills) | Agent-Skills: Doku anlegen, Doku pflegen, Version/Build erhöhen (projektspezifisch · generisch) |

---

## 📷 Bildmaterial

Fotos (Avatare, Pflanzen) stammen von **Pexels** und werden zur Laufzeit von dort geladen. Der Hero (Auth/Onboarding) ist eine KI-generierte,
**eingebettete** JPG (`src/assets/hero.jpg`) – Bild-Importe immer über `assetSrc()`.

---

*Template-Demo – Inhalte sind fiktiv und dienen ausschließlich Präsentationszwecken. Kein Angebot zum Kauf von Cannabis.*

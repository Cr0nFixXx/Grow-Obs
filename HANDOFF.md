# HANDOFF.md

**Für:** Claude Code, OpenCode, Codex, Hermes und andere Coding-Agents  
**Projekt:** Grow|Observer  
**Stand:** Frontend Build **B-37** (Vite Single-File, grün) + Self-Host-API-Grundgerüst  
**Sprache der UI:** Deutsch  
**Vorheriger Agent:** `claude-grow-dev` (Claude · Anthropic)

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
Die Factory wählt anhand von `VITE_API_URL`:

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
npm run dev
npm run build
npx vitest run
npx tsc --noEmit
```

### Backend (Docker)

```bash
cd apps/api
cp .env.example .env
# JWT_SECRET ändern
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

Seed-Admin für lokale Entwicklung:

```text
admin@growobserver.app
admin123
```

Frontend in API-Modus:

```bash
VITE_API_URL=http://localhost:8787
```

`apps/api/.env`:

```bash
CORS_ORIGINS=http://localhost:5173
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
  pages/Communities.tsx
  pages/DevAdmin.tsx

apps/api/
  docker-compose.yml
  Dockerfile
  seed.ts
  src/index.ts
  src/db/schema.ts
  src/middleware/auth.ts
  src/routes/*.ts
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

- BottomSheet: Drag startet nur am Griff über `dragControls`; Inhalt bleibt scrollbar
- Mobile Modal: gleicher Handle-Drag
- Drawer: horizontales Drag mit `touchAction: "pan-y"`
- Menü öffnen: `useEdgeSwipeToOpen` als passiver Window-Listener, kein Overlay-Element
- Long-Press: bricht bei mehr als 10 px Bewegung ab
- Pull-to-Refresh: deaktiviert in Overlays und Formularfeldern
- Mobile TopBar: dauerhaft Burger-Menü

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
- kein Root-`postcss.config.mjs`, solange Vite aktiv ist
- kein `tailwind.config.js`

### Layout

- Custom CSS Properties immer mit Einheit: `"272px"`
- `body` nutzt `overflow-x: clip`, nicht `hidden`
- neue String-Icons in `src/components/Icon.tsx` registrieren

### Backend

- Secrets nur in `apps/api/.env`
- `/admin/*`: `requireAuth` und `requirePlatformAdmin`
- Ownership-Checks auf User-Ressourcen
- Feature-Flags später auch serverseitig prüfen

---

## 8. Noch offen

- Docker-Stack wurde in dieser Agent-Umgebung nicht real gestartet
- `apps/api` wurde hier nicht separat installiert/typegecheckt
- Communities: Community-Feed-Scope, Kick, Hide, Mod-Queue und Tests fehlen
- Realtime/Presence fehlen
- AI ist weiterhin UI/Mock; kein Server-Proxy
- Developer-Admin-Frontend nutzt noch lokale Diagnose-/Mockdaten; vollständige Umstellung auf
  `AdminService`/`/admin/*` steht aus
- Upload-Presign vor Produktion mit Auth schützen
- Next.js-Monorepo ist vorbereitet, nicht aktiv migriert
- Backend-E2E-Tests fehlen

---

## 9. Nächste Schritte

1. `apps/api` installieren/typechecken und per Docker starten
2. Frontend auf `VITE_API_URL=http://localhost:8787` schalten
3. E2E: Register/Login -> Grow -> Post -> Forum -> Community-Invite
4. DevAdmin vollständig auf `/admin/*` umstellen
5. Communities: Kick, Hide, Mod-Queue und Community-Feed-Scope
6. SSE/Realtime für Chat und Notifications
7. AI-Proxy serverseitig
8. PWA Offline-Queue und Sync-Härtung
9. Danach Next.js-Migration

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
```

Zusätzlich:

- Mobile und Desktop prüfen
- Mock- und API-Modus testen
- CHANGELOG und PROGRESS aktualisieren
- API-Vertrag in `apps/api/README.md` und `ARCHITECTURE.md` nachziehen

---

## 11. Ein-Satz-Handoff

> Die PWA-UI ist weitgehend fertig und service-basiert; Self-Host-API und Communities-MVP
> existieren. Als Nächstes muss der Docker-Stack real gestartet, der API-Modus end-to-end geprüft
> und Communities/Realtime/AI produktiv ausgebaut werden.

---

> Handoff aktualisiert von `claude-grow-dev` (Claude · Anthropic) · 2026
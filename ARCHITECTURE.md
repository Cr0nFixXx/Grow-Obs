# ARCHITECTURE.md

Backend-/Daten-Anbindung für Grow|Observer.

## Sicherheits- und Laufzeitstand

- Hono-App-Factory: `apps/api/src/app.ts`; Portstart getrennt in `src/index.ts`.
- API-Build: NodeNext und explizite `.js`-Imports; Runtime-Ausgabe `dist/index.js`.
- JWT identifiziert den User; Rechte werden aus der aktuellen DB-Rolle geladen, nicht aus
  Gamification-Werten oder alten JWT-Rollen abgeleitet.
- Private Community-Discovery und Chat-Verlauf sind mitgliedschaftsgebunden. Invite-Einlösung
  und letzte Admin-Rolle werden durch Transaktion/Zeilensperren geschützt.
- Initialmigration: `apps/api/drizzle/0000_initial.sql`; bestehende Datenbanken benötigen ein
  geprüftes Baseline-Verfahren, keine automatische Wiederanlage.
- `ServiceHealth.status` unterscheidet `ok`, `down`, `unknown`. `/health` ist nur Liveness,
  `/admin/health` prüft die Abhängigkeiten. Admin-Content liefert ein Array gemäß Frontend-Vertrag.
- `public/sw-policy.js` definiert eine statische Cache-Allowlist. Auth/API-Daten sind network-only;
  Offline-Writes/Account-Caches sind damit ausdrücklich noch nicht implementiert.
- Mock-Sitzungen sind als Demo getrennt. API-Sitzungen enthalten eine explizite Rolle und müssen
  vor dem Rendern geschützter Views bestätigt sein.
- Neue Regressionstests siehe `TESTING.md`; Laufzeitergebnisse hier noch nicht vorhanden.

Die UI spricht niemals direkt `fetch` oder die Mock-Arrays an, sondern eine **Service-Layer**.
Diese hat zwei Implementierungen (Mock & API), die über eine Konfiguration ausgetauscht werden.
So bleibt die UI stabil, während das Backend schrittweise angebunden wird.

---

## Schichten-Modell

```
 UI (views/)
   │  nutzt Hooks: useGrows(), useSocialPosts(), useStrains() …
   ▼
 Data-Layer (src/data/)
   │  useServices() / Hooks (loading/error/refresh, CRUD-Aktionen)
   ▼
  Service-Layer (src/services/)
   │  Verträge: GrowService, SocialService, StrainService …
   ├─► mock.ts   → statische Mock-Daten (+ IndexedDB, künstl. Latenz)
    └─► api.ts    → `apps/api` via HTTP-Client
            ▲
 config.useMock (src/lib/config.ts) wählt aus
            ▲
 NEXT_PUBLIC_API_URL (leer = Mock, gesetzt = API)
```

Langfristig zwei Speicher-Pfade (siehe `MILESTONES.md`):

```
Free-Edition     → dieser Stack (zentrale API + Postgres, at-rest encryption)
Pro/CSC/Enterprise → packages/sync: SQLite/SQLCipher + Event-Log + E2EE
                     optional untrusted Relay (nur Ciphertext, kein Klartext)
```

Die Service-Interfaces bleiben die **gleiche** TypeScript-API (`GrowService.list()` …).  
Implementierungen: `mock` | `api` (Free-Cloud) | `local` (Paid local-first). UI ändert sich nicht.

---

## Dateien

| Datei | Rolle |
|-------|-------|
| `src/types/index.ts` | Domänen-Typen (Single Source of Truth) + Eingabe-Typen (`CreateGrowInput` …) |
| `src/lib/config.ts` | `apiBaseUrl` + `useMock` (gesteuert über `NEXT_PUBLIC_API_URL`, Vite-Legacy: `VITE_API_URL`) |
| `src/lib/api.ts` | HTTP-Client `http.get/post/put/patch/delete`, `ApiError`, `setAuthToken` (Bearer-Token) |
| `src/lib/auth.tsx` | `AuthProvider` + `useAuth()` (login/register/logout, Token-Persistenz, Session-Restore) |
| `src/services/interfaces.ts` | Verträge für Grows, Social, Forum, Chat, Wiki, Katalog, Communities, Admin |
| `src/services/mock.ts` | Mock-Implementierung (Mock-Daten, IndexedDB, simulierte Latenz) |
| `src/services/api.ts` | API-Implementierung (REST-Endpunkte) |
| `src/services/index.ts` | Factory: wählt Mock ↔ API (`config.useMock`) |
| `src/data/DataContext.tsx` | `DataProvider` + `useServices()` (stellt Registry bereit) |
| `src/data/hooks.ts` | Async-Hooks für alle produktiven Domänen inkl. Communities |
| `.env.example` | `NEXT_PUBLIC_API_URL` (leer = Mock) |
| `apps/api/src` | Hono-API, Drizzle-Schema, Auth, Routes, MinIO |
| `apps/api/docker-compose.yml` | Postgres + MinIO + API |

Aktive Service-Registry: Grows, Social, Strains, Wiki, Forum, Chat, Notifications, Products,
Breeders, Hall, Activity, Communities und Admin.

Backend-Routen liegen in `apps/api/src/routes/`. Admin-Routen sind mit `requireAuth` und
`requirePlatformAdmin` geschützt. Community-Routen benötigen JWT; private Details nur für Mitglieder.

---

## Mock- vs. API-Modus

```bash
# Mock (Default – kein Server nötig)
NEXT_PUBLIC_API_URL=

# API (echtes Backend)
NEXT_PUBLIC_API_URL=https://api.growobserver.app
```
Die `services`-Factory liefert automatisch die passende Implementierung. Das Bearer-Token
wird vom `AuthProvider` via `setAuthToken()` gesetzt und vom HTTP-Client gesendet.

---

## Neue Domäne hinzufügen (Pattern)

1. **Typ** in `src/types/index.ts` ergänzen (bzw. in `mocks/data.ts`).
2. **Interface** in `src/services/interfaces.ts` (z. B. `WikiService`) + in `Services` aufnehmen.
3. **Mock-Impl.** in `src/services/mock.ts` (`wikiService` + `mockServices` erweitern).
4. **API-Impl.** in `src/services/api.ts` (`wikiService` + `apiServices` erweitern).
5. **Hook** in `src/data/hooks.ts` (z. B. `useWikiArticles()`).
6. **Seite** nutzt den Hook statt direktem Mock-Import.

---

## Seite auf die Data-Layer migrieren (Beispiel)

```tsx
// Vorher (direkter Mock-Import)
import { grows } from "@/mocks/data";

// Nachher (Service-/Hook-basiert)
import { useGrows } from "@/data/hooks";
function Grows() {
  const { grows, loading, error, refresh } = useGrows();
  if (loading) return <SkeletonCard />;
  // …
}
```
Aktionen: `const { createPost } = useSocialPosts();` → ruft `services.social.createPost()`,
im API-Modus ein `POST /social/posts`, im Mock-Modus IndexedDB + Latenz.

---

## REST-Konvention (erwartete Backend-Endpunkte)

| Methode | Pfad | Service-Methode |
|---------|------|-----------------|
| GET | `/auth/me` | Session-Restore |
| POST | `/auth/login` / `/auth/register` | `login` / `register` |
| GET/POST | `/grows` | `list` / `create` |
| GET | `/grows/:id` | `get` |
| POST | `/grows/:id/logs` | `addLog` |
| GET/POST | `/social/posts` | `listPosts` / `createPost` |
| POST | `/social/posts/:id/like` | `toggleLike` |
| GET | `/strains` | `list` |
| GET/POST | `/communities` | `list` / `create` |
| GET | `/communities/:id` | `get` |
| POST | `/communities/:id/join` | `joinPublic` |
| POST | `/communities/:id/invites` | `createInvite` |
| POST | `/communities/join` | `joinByCode` |
| PATCH | `/communities/:id/members/:userId/role` | `setMemberRole` |
| GET | `/admin/health`, `/admin/stats`, `/admin/users`, `/admin/content` | Developer-Admin |

### Betriebsarten (B-46)

| Modus | `NEXT_PUBLIC_API_URL` | Backend | Speicherung |
|---|---|---|---|
| **Embedded (Standard)** | nicht gesetzt → `/api` | Hono-App in Next.js (`app/api/[...route]`) | PostgreSQL (`DATABASE_URL`) |
| Extern (Docker) | `https://api.example.com` | `apps/api` als eigener Dienst | PostgreSQL + MinIO |
| Demo/Mock | leer (`NEXT_PUBLIC_API_URL=`) | keins | nur Session (Speicher) |

Embedded: Migrationen beim ersten Request, S3 optional (Uploads `503`), JWT-Secret aus `.env.local`.

### App-Updates (B-50)

| Methode | Endpoint | Auth | Zweck |
|---|---|---|---|
| GET | `/api/version` | nein | `{ version, build, builtAt }` der laufenden Instanz (Next-Route) |
| GET | `/releases` | nein | Release-Notes, neueste zuerst |
| POST / DELETE | `/admin/releases[/:id]` | Plattform-Admin | veröffentlichen / löschen |

Update verfügbar ⇔ `build` ≠ eingebetteter Client-Build. Pflicht ⇔ zusätzlich `required`-Release nach
dem Client-Build. Anwenden = SW-Update + Reload (HTML ist network-first, Chunks sind gehasht).

### Feature-Flags (B-49)

| Methode | Endpoint | Auth | Zweck |
|---|---|---|---|
| GET | `/features` | nein | `{ overrides: { forum: false, … } }` – fehlender Key = Default (an) |
| PUT | `/admin/features/:key` | Plattform-Admin | `{ enabled }`; Kern-Feature → 409 |
| DELETE | `/admin/features` | Plattform-Admin | alle Overrides löschen |

Deaktivierte Features: API antwortet auf zugehörige Pfade mit `403 { error, feature }`; der Client lädt
daraufhin die Flags neu. Pfad-Zuordnung: `apps/api/src/lib/features.ts`.

### Endpunkte B-48

| Methode | Endpoint | Auth | Zweck |
|---|---|---|---|
| POST | `/forum/threads/:id/vote` | ja | `delta` 1/-1/0 → `{ votes, myVote }` |
| POST | `/forum/comments/:id/vote` | ja | wie oben, für Kommentare |
| POST | `/forum/threads/:id/comments` | ja | `parentId?` = Antwort |
| GET | `/forum/threads[/:id]` | optional | liefert `myVote` für angemeldete Nutzer |
| GET / POST | `/hall/:id/comments` | nein / ja | Kommentare zu Hall-of-Fame-Einträgen |
| GET / POST | `/social/posts/:id/comments` | ja | Kommentare zu Posts |

### Endpunkte B-47

| Methode | Endpoint | Auth | Zweck |
|---|---|---|---|
| POST | `/media` | ja | Bild hochladen (roher Body, ≤ 2 MB) → `{ path: "/media/<id>" }` |
| GET / DELETE | `/media/:id` | nein / Eigentümer | Bild ausliefern / löschen |
| POST | `/grows/:id/photos` | Eigentümer | `{ url }` zur Galerie, erstes Foto = Cover |
| PATCH | `/auth/me` | ja | `{ name?, title?, avatar? }` |
| GET | `/strains/collection` | ja | eigene Sammlung |
| POST | `/strains/:id/collect` | ja | Sammeln umschalten → `{ collected }` |
| POST | `/chat/:id/messages` | Mitglied | zusätzlich `image?` (Text oder Bild erforderlich) |

### Neue Endpunkte (B-45)

| Service | Methode | Endpoint | Auth |
|---|---|---|---|
| `strains.create` | POST | `/strains` | ja (Community-Sorte, `tag: "Community"`) |
| `strains.catalog` | GET | `/strains` | nein |
| `wiki.create` | POST | `/wiki` | ja (Entwurf `version: "0.1"`) |
| `tasks.list` / `create` | GET / POST | `/tasks` | ja, nur eigene |
| `tasks.toggle` | POST | `/tasks/:id/toggle` | ja, fremde IDs → 404 |

Hinweis: Im API-Modus liefert `strains.list()` den Katalog, da das Backend (noch) keine persönliche
Sammlung kennt.

### Bewusst statische Demo-Inhalte (keine Backend-Domäne)

Direkt aus `src/mocks/data.ts` gelesen, in beiden Modi identisch: KI-Agenten/Vorschläge/Bodenrezepte
(AIAssistant), Kostenrechner-Defaults (Calculator), Verbrauchs-/Klima-Charts und Quick-Stats
(Consumption, Dashboard, Showcase), Wachstumsphasen (Simulation), Stories/Trends/Vorschläge (Social),
Bewertungsverteilung/Reviews (Strains-Modal), Autoren-Avatare (Wiki). Bei neuer Backend-Domäne:
Service + Hook ergänzen und den Import ersetzen.

### Backend lokal starten

```bash
cd apps/api
cp .env.example .env
docker compose up --build
```

Der API-Modus des Frontends wird mit `NEXT_PUBLIC_API_URL=http://localhost:8787` (Build-Zeit) aktiviert.

---

> **Dokumentation gepflegt von:** Claude (Anthropic) · Kennung `claude-grow-dev` · Stand 2026

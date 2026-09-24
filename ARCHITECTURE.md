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
 UI (pages/)
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
 VITE_API_URL (leer = Mock, gesetzt = API)
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
| `src/lib/config.ts` | `apiBaseUrl` + `useMock` (gesteuert über `VITE_API_URL`) |
| `src/lib/api.ts` | HTTP-Client `http.get/post/put/patch/delete`, `ApiError`, `setAuthToken` (Bearer-Token) |
| `src/lib/auth.tsx` | `AuthProvider` + `useAuth()` (login/register/logout, Token-Persistenz, Session-Restore) |
| `src/services/interfaces.ts` | Verträge für Grows, Social, Forum, Chat, Wiki, Katalog, Communities, Admin |
| `src/services/mock.ts` | Mock-Implementierung (Mock-Daten, IndexedDB, simulierte Latenz) |
| `src/services/api.ts` | API-Implementierung (REST-Endpunkte) |
| `src/services/index.ts` | Factory: wählt Mock ↔ API (`config.useMock`) |
| `src/data/DataContext.tsx` | `DataProvider` + `useServices()` (stellt Registry bereit) |
| `src/data/hooks.ts` | Async-Hooks für alle produktiven Domänen inkl. Communities |
| `.env.example` | `VITE_API_URL` (leer = Mock) |
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
VITE_API_URL=

# API (echtes Backend)
VITE_API_URL=https://api.growobserver.app
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

### Backend lokal starten

```bash
cd apps/api
cp .env.example .env
docker compose up --build
```

Der API-Modus des Frontends wird mit `VITE_API_URL=http://localhost:8787` aktiviert.

---

> **Dokumentation gepflegt von:** Claude (Anthropic) · Kennung `claude-grow-dev` · Stand 2026

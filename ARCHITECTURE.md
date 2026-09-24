# ARCHITECTURE.md

Backend-/Daten-Anbindung – **Grundgerüst** für Grow|Observer.

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
   └─► api.ts    → echtes Backend via HTTP-Client
            ▲
 config.useMock (src/lib/config.ts) wählt aus
            ▲
 VITE_API_URL (leer = Mock, gesetzt = API)
```

---

## Dateien

| Datei | Rolle |
|-------|-------|
| `src/types/index.ts` | Domänen-Typen (Single Source of Truth) + Eingabe-Typen (`CreateGrowInput` …) |
| `src/lib/config.ts` | `apiBaseUrl` + `useMock` (gesteuert über `VITE_API_URL`) |
| `src/lib/api.ts` | HTTP-Client `http.get/post/put/patch/delete`, `ApiError`, `setAuthToken` (Bearer-Token) |
| `src/lib/auth.tsx` | `AuthProvider` + `useAuth()` (login/register/logout, Token-Persistenz, Session-Restore) |
| `src/services/interfaces.ts` | Service-Verträge (`GrowService`, `SocialService`, `StrainService`, `Services`) |
| `src/services/mock.ts` | Mock-Implementierung (Mock-Daten, IndexedDB, simulierte Latenz) |
| `src/services/api.ts` | API-Implementierung (REST-Endpunkte) |
| `src/services/index.ts` | Factory: wählt Mock ↔ API (`config.useMock`) |
| `src/data/DataContext.tsx` | `DataProvider` + `useServices()` (stellt Registry bereit) |
| `src/data/hooks.ts` | `useGrows`, `useStrains`, `useSocialPosts` (async-Listen + Aktionen) |
| `.env.example` | `VITE_API_URL` (leer = Mock) |

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

---

> **Dokumentation gepflegt von:** Claude (Anthropic) · Kennung `claude-grow-dev` · Stand 2026

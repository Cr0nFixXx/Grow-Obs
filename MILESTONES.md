# MILESTONES.md

**Für:** Claude Code, OpenCode, Codex, Hermes, Product  
**Projekt:** Grow|Observer  
**Lies zuerst:** `HANDOFF.md` → `PLAN.md` → **dieses File** (Produkt-Nordstern)

`PLAN.md` = *wie* der nächste Code gebaut wird (P0–P14).  
`MILESTONES.md` = *was* das Produkt werden soll und welche Meilensteine in welcher Reihenfolge.

**Status der Vision:** Nordstern beschlossen; Native/Editionen/E2EE bleiben zurückgestellt.  
Aktueller Code: PWA-Frontend, Service-Layer, Self-Host-API-Grundgerüst und Communities-MVP.

---

## Aktueller Fokus — PWA first

Jetzt aktiv:

- Self-Host-PWA und REST-Backend
- Auth, Grow-Tagebuch, Social/Forum/Chat/Wiki
- Communities (öffentlich/privat, Invite-Code, Rollen)
- Developer-Admin und Feature-Flags
- als Nächstes: realer API-E2E-Test, Community-Moderation, Feed-Scope und Realtime

Nicht jetzt: Editionen, Native Apps, E2EE/P2P und In-App-Purchases.

---

## 0. Nordstern (zurückgestellt)

Eine **vermarktungsfähige native App** (zuerst Android, dann iOS) plus **optimierte Desktop-Web-Version**.

Datenschutz ist kein Feature-Toggle, sondern Architektur:

- **Paid-Editionen:** Daten primär **auf den Geräten** (local-first). Communities synchronisieren **Ende-zu-Ende verschlüsselt**. Löschen eines Beitrags/Fotos durch den Autor entfernt die Daten **auf allen Community-Geräten** (spätestens beim nächsten Online-Sync).
- **Free-Edition:** öffentliche Communities, reduzierter Umfang, In-App-Käufe, **zentrale** Speicherung auf gehosteten Servern (**at-rest verschlüsselt**, kein Geräte-P2P-Mesh).

Private Communities (Paid) per **Einmal-Code** (QR / Hash). Öffentliche Communities (Free + optional Paid) über Verzeichnis.

Admins/Moderatoren steuern Communities. Eigenes **Admin-/Mod-Dashboard** in Web und App.

---

## 1. Editionen (verbindliches Produktmodell)

Eine **Codebasis**, Feature-Flags + Entitlement-Server (Paid) bzw. IAP (Free).  
Nicht vier Forks.

| | **Free** | **Privat / Pro** | **Cannabis Social Club (CSC)** | **Enterprise** |
|---|---|---|---|---|
| **Preis** | 0 € + IAP | Abo / Lifetime | Club-Lizenz (pro Club + Seats) | Vertrag / Seats |
| **Speicher** | Zentral, server-encrypted | **Nur Geräte** + P2P-Sync | Geräte + optional Club-Node (self-host) | Geräte + org-node / VPC |
| **Communities** | Nur **öffentlich** | Öffentlich + **privat** | Club-intern privat + optional öffentlich | Org-Spaces, SSO |
| **Beitritt** | Katalog / Invite-Link | QR / Hash / Einmal-Code | Club-Code, KYC-light (Club-seitig) | Admin-Provisionierung |
| **Lösch-Propagierung** | Server löscht, Clients pull | **Tombstone + Sync auf alle Peers** | wie Pro, plus Club-Retention-Policy | wie CSC + Audit-Log |
| **Grow-Tagebuch** | 1–2 Grows, Watermark-Export | Unbegrenzt | Club-Chargen / Mitglieder-Grows | Multi-Site |
| **Social Feed** | Öffentliche Netze, Ads/IAP | E2EE in privaten Communities | Club-Feed | Org-Feed |
| **KI** | Quota / IAP | Voll | Club-Prompts / Compliance-Hinweise | Org-Policies, keine Daten an Public-LLM ohne Opt-in |
| **Admin/Mod** | Plattform-Mods (Betreiber) | Community-Admins | Club-Vorstand + Mods | Org-Admin, Rollen, SCIM später |
| **Offline** | Read-cache | **First-class** (volle CRUD lokal) | First-class | First-class |
| **Analytics** | Aggregiert, opt-in | Default **off**, lokal | Club-Aggregat ohne Personenbezug | Org-Dashboard |
| **Support** | Community | E-Mail | Dedicated | SLA |

### IAP (nur Free)

Beispiele, nicht final preisen:

- Extra-Grows / Foto-Slots  
- KI-Kontingent  
- Cosmetics (Themes)  
- „Boost“ für öffentliche Posts  

**Kein** IAP, der Private-P2P oder Geräte-only-Storage freischaltet — das ist **Pro/CSC/Enterprise**.

### Feature-Flag-Schema (früh einführen)

```ts
type Edition = "free" | "pro" | "csc" | "enterprise";

interface Entitlements {
  edition: Edition;
  maxGrows: number | "unlimited";
  privateCommunities: boolean;
  p2pSync: boolean;
  centralCloud: boolean;
  e2ee: boolean;
  adminConsole: boolean;
  iap: boolean;
  customBranding: boolean;
}
```

Lived in `packages/shared`. UI blendet Nav-Punkte anhand `entitlements.*` aus — **nie** nur Client-Check als Sicherheit; Server/Protokoll muss ablehnen.

---

## 2. Datenschutz-Architektur (nicht verhandelbar)

### 2.1 Bedrohungsmodell (kurz)

| Angreifer | Free | Paid (Pro/CSC/Enterprise) |
|---|---|---|
| Betreiber kann Klartext lesen | Möglich (server-side encryption mit Betreiber-Key = **nicht** E2EE). Ziel: **envelope encryption**, Betreiber sieht Metadaten. Klartext nur mit User-Key. | **Nein** für Community-Inhalte. Betreiber sieht höchstens Ciphertext + Routing-Metadaten. |
| Anderes Community-Mitglied | Sieht geteilte Inhalte (absichtlich). | Sieht geteilte Inhalte, **nicht** private Grows außerhalb der Community. |
| Ausgeschlossenes Ex-Mitglied | Server entzieht Zugriff. | Re-Key der Community-Key **oder** Forward-Secrecy-Policy dokumentieren (siehe Risiken). |
| Diebstahl des Geräts | OS-Schutz + optional App-PIN. | OS-Schutz + PIN/Biometrie + SQLCipher. |
| Gesetzliche Anfrage an Hoster | Server-Daten (Free) / Metadaten. | Paid: keine Inhalts-Klartexte auf unseren Servern. |

**Ehrlich bleiben:** echtes E2EE + P2P + garantierte Löschung ist **schwer**. Lieber ein korrektes MVP (Tombstones + Sync) als „militärische Anonymität“ versprechen.

### 2.2 Schlüssel

- Identity-Keypair pro Gerät (Ed25519) + User-Identity über Geräte hinweg (X25519).
- **Community-Key** (symmetrisch, z. B. XChaCha20-Poly1305): nur Mitglieder.
- Invite: Einmal-Code enthält (oder wrapped) Community-Key + Join-Token. QR = Payload oder URL `growobserver://join/<token>`.
- Medien: Datei-Key zufällig, Datei verschlüsselt, Datei-Key mit Community-Key wrapped. Speichern als Blobs lokal; Sync nur Ciphertext.

Library-Kandidaten: **libsodium / libsodium-wrappers** oder **age**-ähnliches. Nicht selbst Crypto basteln.

### 2.3 Local-First Speicher (Paid)

- Pro Gerät: **SQLite** (SQLCipher) oder vergleichbar.  
  Mobile: expo-sqlite / OP-SQLite. Web: OPFS + wa-sqlite **oder** IndexedDB nur als Übergang.
- CRDT **oder** append-only Event-Log + Snapshots. Empfohlen für dieses Produkt:
  - **Event-Log** (grow.created, post.created, post.deleted, member.joined, …)
  - Lamport/Hybrid Logical Clock
  - **Tombstones** mit `content_hash` + `author_id` + `deleted_at` + Signatur
- Sync: nicht „jeder mit jedem Mesh-Chaos“. Praktisches Modell:

```
Gerät ──(E2EE)──► optionale Relay-Nodes (Paid: nur Ciphertext, zero-knowledge)
         └── P2P (WebRTC / BLE later) wenn beide online
```

**Paid darf einen untrusted Relay** (Store-and-forward Ciphertext) nutzen, sonst treffen sich Peers nie. Das ist **nicht** zentrale Klartext-Cloud. In der Kommunikation nicht als „Cloud-Speicher“ verkaufen.

Free: klassische API + DB (PLAN.md Variante A), Felder at-rest encrypted (Disk + App-level envelope wo sinnvoll).

### 2.4 Lösch-Propagierung (Authoritative Requirement)

Szenario: Community X = {U1, U2, U3, U4}. U2 löscht `Bild0123`.

**Protokoll:**

1. U2 schreibt lokal `post.deleted { id, content_hash, sig }` und **löscht Ciphertext + Thumbnails lokal sofort**.
2. Event geht in Outbox. Beim nächsten Online-Fenster: Push an Peers / Relay.
3. U1/U3/U4 wenden Tombstone an: Blob + DB-Row weg, Tombstone **behalten** (gegen Wiederauferstehung aus altem Backup).
4. Retention der Tombstones: z. B. 2 Jahre oder bis Community-Re-Key.
5. Offline-Peer kommt Wochen später online → zieht Log ab Cursor → löscht nach.

**Nicht versprechen:** sofortige Löschung auf ausgeschaltetem Gerät. Versprechen: *spätestens beim nächsten erfolgreichen Sync*.

**Orphan-Files:** Garbage-Collect Blobs ohne Live-Ref und mit Tombstone.

### 2.5 Anonymität vs. UX

- Free: E-Mail/Account normal.
- Pro: Account kann **Handle + Geräte-Keys** sein; E-Mail optional. Recovery: Seed-Phrase oder Recovery-Key (UX-schmerzhaft, aber ehrlich).
- Keine Analytics-SDKs in Paid-Default. Crash-Reports nur opt-in, ohne Community-Inhalte.
- Keine Drittanbieter-Fonts/Tracker in Paid-Builds wenn vermeidbar (self-host Fonts).

---

## 3. Native Apps (Android zuerst, dann iOS)

### 3.1 Technologie

**Empfohlen: Expo (React Native) im Monorepo** `apps/mobile`.

Begründung: eine UI-Sprache (React), bestehendes Design-System als Tokens + Shared Packages, Store-Qualität besser als WebView-Wrap. Capacitor nur als Notnagel.

```
apps/mobile          Expo Router
packages/ui          Primitive (web) — mobile nutzt Nativewind oder eigene RN-Primitives
packages/shared      Domain, crypto, sync, entitlements
packages/sync        Event-log, tombstones, E2EE
```

**Nicht** die komplette `ui.tsx` (DOM/Tailwind) 1:1 nach RN kopieren. Tokens (`DESIGN.md`) + Screen-Flows wiederverwenden, Native Components neu.

### 3.2 Store-Realität (nicht ignorieren)

Cannabis-bezogene Apps:

- **Google Play / App Store** können Rejects liefern (Guidelines zu Drogen). Plan B: Sideload / alternative Stores (F-Droid-Policy ebenfalls streng), CSC-Distribution (MDM), EU-Sideloading.
- Keine Kaufabwicklung illegaler Ware in der App. Grow-Journal + Community, keine Shop-Checkout für Blüten in der Free-Store-Version.
- Jugendschutz, regionale Flags (`region = DE` legal framework ≠ Store-OK).
- Impressum, Datenschutz, Altersgate (18+).

Meilenstein „Play Store live“ ist **eigenes Risiko-Gate**, kein reiner Code-Milestone.

### 3.3 Native-MVP (Android)

Must:

- Login / Geräte-Identity  
- Offline Grow-Tagebuch  
- Eine Community joinen (QR)  
- Feed lesen/posten (lokal + Sync)  
- Foto aufnehmen, E2EE speichern  
- Löschen mit Propagierung  
- Biometrie-Lock  

Später iOS: gleicher Code, Entitlements, Push (APNs).

---

## 4. Communities

### 4.1 Typen

| Typ | Edition | Sichtbarkeit | Sync |
|---|---|---|---|
| Public Network | Free (+ Pro read?) | Verzeichnis | Server |
| Private Circle | Pro / CSC / Ent | Invite-only | P2P + Relay Ciphertext |
| Club Space | CSC | Mitglieder | wie Private + Club-Node |
| Org Unit | Enterprise | Provisioniert | Org-Node |

### 4.2 Join-Flow (Private)

1. Admin erzeugt Einmal-Code (TTL z. B. 24 h, max N uses).
2. Payload: `community_id`, `invite_id`, wrapped community key, signature, relay hint.
3. QR oder Copy-Hash (`go-inv_…`).
4. Neues Gerät scannt → Identity-Key → Membership-Event → Key installiert.
5. Code wird serverseitig (Free) bzw. im Log als `invite.redeemed` (Paid) invalidiert.

### 4.3 Rollen

`owner` · `admin` · `moderator` · `member` · `read-only` (Enterprise)

Rechte (Minimum):

| Aktion | Member | Mod | Admin | Owner |
|---|---|---|---|---|
| Posten | ✓ | ✓ | ✓ | ✓ |
| Eigenes löschen | ✓ | ✓ | ✓ | ✓ |
| Fremdes verbergen (moderation hide) | | ✓ | ✓ | ✓ |
| Mitglieder kicken | | | ✓ | ✓ |
| Invites | | | ✓ | ✓ |
| Re-Key / Dissolve | | | | ✓ |
| Rollen ändern | | | ✓ | ✓ |

**Moderation hide ≠ Author-Delete.** Hide ist Policy-Flag, Delete ist Tombstone des Autors (und nur Autor oder Court-Order-Prozess). In Paid E2EE kann ein Mod **nicht** Klartext „vom Server löschen“ — nur Membership entziehen + Hide-Event, das Clients UI ausblenden lässt. Inhalte auf Offline-Geräten bleiben bis Sync; dokumentieren.

---

## 5. Admin- & Moderatoren-Oberfläche

Eigenes Segment, nicht in User-Settings verstecken.

### 5.1 Community-Konsole (in App + Web)

- Mitglieder, Rollen, Invites (QR erzeugen)  
- Reports Queue  
- Hide / Kick  
- Audit: wer hat Rolle geändert (Paid: signierte Events)  
- Speicher: Sync-Status, offene Tombstones  

### 5.2 Plattform-Konsole (nur Betreiber, Free-Cloud)

- Öffentliche Communities, Abuse, IAP, Legal-Holds  
- **Kein** Zugriff auf Paid-Ciphertext  

### 5.3 CSC / Enterprise

- Chargen / Mitglieder-Listen (CSC legal ops — **ohne** unnötige Gesundheitsdaten)  
- SSO (Enterprise, später)  
- Export für Club-Buchhaltung (aggregiert)

UI: neue Routes `/(app)/mod/*` und `/(app)/admin/*` plus Mobile-Tabs „Mod“. Desktop-Web **dicht, tabellarisch, Keyboard** (DESIGN.md erweitern: Density-Mode).

---

## 6. Desktop-Web

Heute: Mobile-First PWA. Ziel: **echte Desktop-App-Qualität** im Browser (und optional später Tauri).

- Persistente Sidebar, Multi-Column (Feed | Detail | Inspector)  
- Keyboard: ⌘K bleibt, J/K Navigation, Mod-Queue  
- Density: compact tables für Admin  
- Kein Bottom-Nav auf `lg+` (schon so)  
- Große Grow-Galerie, Split-Chat (schon angelegt)  
- Optional `apps/desktop` Tauri wrapping `apps/web` — **nicht** vor Native-Android

---

## 7. Meilensteine (produktseitig)

Nummerierung **M0–M12**. Mapping auf `PLAN.md` in Klammern.

### M0 — Template freeze (IST)

**Code heute.** UI vollständig, Mock-Daten, Service-Skeleton, Next-Skeleton.

**Done:** Vite-Build grün, Docs (HANDOFF/PLAN/diese Datei) gelesen.

### M1 — Entitlements + Service-Verdrahtung (`PLAN` P1)

- `Entitlements` in shared  
- UI-Gates (Free sieht keine Private-Join-QR)  
- Pages nutzen Hooks, keine direkten Mocks  

**Akzeptanz:** Feature-Flag blendet Nav; Mock-User kann Edition wechseln in Dev-Settings.

### M2 — Web-Monorepo Next.js (`PLAN` P2–P3)

- `apps/web` läuft, File-based Routing, Desktop-Layout polish  

**Akzeptanz:** Deep Links, `next build`, Desktop-Split-Views auf `xl`.

### M3 — Free-Cloud-Backend (`PLAN` P4–P6)

- Variante A: Auth, Postgres, öffentliche Communities, Grows, Feed  
- Server-side encryption at rest  
- IAP-Stub (RevenueCat later for mobile; Web: Stripe)  

**Akzeptanz:** Zwei Browser, öffentlicher Feed, Persistenz, Register/Login.

### M4 — Community-Rollen + Mod-Dashboard (Web)

- Rollen, Reports, Hide, Kick  
- Mod-Sektion  

**Akzeptanz:** Mod kann Post verbergen und Member kicken; Audit-Log sichtbar.

### M5 — Local-First Kernel (Paid-Pfad)

- SQLite/SQLCipher am Client  
- Event-Log + Tombstones  
- Outbox-Sync gegen **untrusted relay** (noch ohne Mesh)  
- E2EE für `post` + `media` in einer Private Community  

**Akzeptanz:** Zwei Browser-Profile, gleiche Private Community: Post erscheint verschlüsselt auf Relay (Dev-Tools: kein Klartext), Löschen auf A entfernt auf B nach Refresh/Sync.

### M6 — Invite QR / Hash

- Einmal-Codes, TTL, QR in App/Web  
- Join auf zweitem Gerät  

**Akzeptanz:** Scan (oder Paste Hash) → Mitglied; Code danach ungültig.

### M7 — Android Native MVP (`apps/mobile`)

- Expo App: Journal offline, Join QR, Feed, Foto, Tombstone  
- Play-Internal-Testing Track (nicht zwingend Production)  

**Akzeptanz:** Flugmodus: Grow anlegen. Online: Sync. Delete propagiert auf Web-Client derselben Community.

### M8 — CSC-Edition

- Club-Raum, Mitglieder-Admin, Chargen-Felder (minimal)  
- Lizenz-Gate  

**Akzeptanz:** Club-Owner lädt 5 Members per QR, sieht Mod-Queue.

### M9 — IAP Free + Paywall Pro

- RevenueCat (Android) + Stripe (Web)  
- Restore Purchases  

**Akzeptanz:** Free-User kauft Pro-Mock/Sandbox → `privateCommunities: true`.

### M10 — Enterprise-light

- Org-Admin, mehrere Spaces, Export  
- Noch kein SCIM  

### M11 — iOS

- Dieselbe Expo-Codebase, TestFlight  
- Store-Gate separat  

### M12 — Mesh-P2P (optional, nach Relay-Stabilität)

- WebRTC / local network sync ohne Relay, wenn beide online  
- BLE nur wenn Bedarf (hohe Komplexität)

**Nicht** vor M5–M7.

---

## 8. Mapping PLAN.md ↔ MILESTONES.md

| PLAN | Milestone | Hinweis |
|---|---|---|
| P0–P1 | M0–M1 | Jetzt starten |
| P2–P3 | M2 | Next + Desktop-Web |
| P4–P6 | M3 | Free-Cloud |
| P7 | M4 + Chat später | Forum/Wiki vor P2P |
| P8 | Teil von M3/M9 | IAP, Marktplatz nur Free-Cloud |
| P9 | KI hinter Quota; Paid: Kontext **nicht** an LLM ohne Opt-in | |
| P10 | Harden vor M7 Store | |
| — | M5–M6 | **Neues Arbeitspaket** `packages/sync` — in PLAN nicht enthalten, hier führen |
| — | M7–M11 | Native / Editionen |
| — | M12 | Echtes P2P Mesh |

Agents in den nächsten Wochen: **nicht** M7 anfangen, bevor M1–M3 stehen. Local-First ohne stabile Domain-Hooks wird weggeworfen.

---

## 9. Risiken (Agents nicht schönreden)

1. **App-Store-Policy** kann Android/iOS-Distribution blockieren. Parallel: PWA + Direct APK für CSC.  
2. **E2EE vs. Moderation:** Mods können E2EE-Inhalte nicht serverseitig scannen. Hide ist client-enforced.  
3. **Löschen ≠ forensisch unwiederbringlich** (Backups, Screenshots). Copy schreiben: „best effort sync delete“.  
4. **Key-Loss:** ohne Recovery-Key ist Community-Daten weg. UX dafür bauen, bevor Launch.  
5. **Relay-Metadaten:** IPs, Timing. Anonymität ist nicht Tor. Optional später: Tor/I2P nur Enterprise-Forschung.  
6. **CRDT-Merge von Bildern** ist sinnlos — Blobs sind immutable, Delete ist Tombstone.  
7. **Vier Editionen** verleiten zu if-else-Hölle. Nur `entitlements` abfragen.

---

## 10. DoD für Vision-Arbeit

Zusätzlich zu HANDOFF DoD:

- Keine Klartext-Community-Inhalte in Paid-Relays (Test: mitzulesen in Devtools/Network).  
- Tombstone-Test mit 2 Clients automatisiert.  
- Edition-Matrix in Tests (`entitlements.privateCommunities === false` → API 403).  
- Datenschutz-Text (kurz) in `/legal/privacy` aktualisieren, wenn Sync-Modell sich ändert.

---

## 11. Status

```
Vision (später): Native, Editionen, E2EE — dieses File ab §0
Jetzt:           PWA + Self-Host-Backend + Feature-Flags + Dev-Admin
Implementiert:   M0 + Self-Host-API-Grundgerüst + Developer-Admin + Communities-MVP
Nächster Schritt: API-Modus E2E, Community-Moderation, Feed-Scope und Realtime (PLAN P5)
Blocker:         Docker/API wurde in dieser Agent-Umgebung nicht real gestartet
```

---

> gepflegt von `claude-grow-dev` (Claude · Anthropic) · 2026

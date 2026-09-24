import type { ViewKey } from "@/lib/nav";

/**
 * Feature-Flags — Default aus dieser Datei.
 * Laufzeit-Overrides (Dev-Admin) liegen in localStorage `go-features`
 * und werden von FeatureProvider drübergelegt. Später: Server-Override.
 *
 * false = aus Nav + View (EmptyState). Services/API sollen denselben Key prüfen.
 */
export const defaultFeatures = {
  dashboard: true,
  auth: true,
  profile: true,
  notifications: true,
  grows: true,
  strains: true,
  breeders: true,
  social: true,
  communities: true,
  forum: true,
  chat: true,
  wiki: true,
  hallOfFame: true,
  marketplace: true,
  ai: true,
  telegram: true,
  planner: true,
  calculator: true,
  consumption: true,
  simulation: true,
  report: true,
  showcase: true,
  /** Betreiber-Konsole (nicht Community-Mod). */
  devAdmin: true,
} as const;

export type FeatureKey = keyof typeof defaultFeatures;

export const featureMeta: { key: FeatureKey; label: string; blurb: string; core?: boolean }[] = [
  { key: "dashboard", label: "Dashboard", blurb: "Startseite und Übersicht", core: true },
  { key: "auth", label: "Login / Registrierung", blurb: "Konto-Zugang", core: true },
  { key: "profile", label: "Profil & Settings", blurb: "Konto, Theme, Sprache", core: true },
  { key: "notifications", label: "Benachrichtigungen", blurb: "In-App-Center", core: true },
  { key: "grows", label: "Grow-Tagebuch", blurb: "Grows, Logs, Galerie" },
  { key: "strains", label: "Sorten-Sammlung", blurb: "Persönliche Genetiken" },
  { key: "breeders", label: "Breeder & Seeds", blurb: "Züchterverzeichnis" },
  { key: "social", label: "Community-Feed", blurb: "Posts, Likes, Follow" },
  { key: "communities", label: "Communities", blurb: "Öffentliche und private Gruppen" },
  { key: "forum", label: "Forum", blurb: "Threads und Kommentare" },
  { key: "chat", label: "Chat", blurb: "Direktnachrichten" },
  { key: "wiki", label: "Wiki", blurb: "Wissensbibliothek" },
  { key: "hallOfFame", label: "Hall of Fame", blurb: "Kuratierte Showcases" },
  { key: "marketplace", label: "Marktplatz", blurb: "Equipment & Seed-Ticker" },
  { key: "ai", label: "KI-Assistent", blurb: "Chat, Agenten, Erdmischung" },
  { key: "telegram", label: "Telegram", blurb: "Bot-Anbindung" },
  { key: "planner", label: "Grow-Planung", blurb: "Sorten-/Substrat-Vergleich" },
  { key: "calculator", label: "Kostenrechner", blurb: "Budget & Optimierung" },
  { key: "consumption", label: "Verbrauch", blurb: "Strom/Wasser-Charts" },
  { key: "simulation", label: "Simulation", blurb: "Wachstumskurven" },
  { key: "report", label: "Grow-Report", blurb: "Auswertung & PDF" },
  { key: "showcase", label: "Design-System", blurb: "Komponenten-Galerie" },
  { key: "devAdmin", label: "Developer-Admin", blurb: "Betreiber: Flags, Health, User", core: true },
];

/** View → Feature. auth bleibt erreichbar auch wenn Flag false (Logout-Pfad). */
export function featureForView(view: ViewKey): FeatureKey {
  if (view === "devAdmin") return "devAdmin";
  if (view in defaultFeatures) return view as FeatureKey;
  return "dashboard";
}

export const STORAGE_KEY = "go-features";

export type FeatureFlags = Record<FeatureKey, boolean>;

export function resolveFeatureFlags(overrides: unknown): FeatureFlags {
  const flags: FeatureFlags = { ...defaultFeatures };
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) return flags;
  const values = overrides as Record<string, unknown>;
  for (const feature of featureMeta) {
    if (!feature.core && Object.prototype.hasOwnProperty.call(values, feature.key) && typeof values[feature.key] === "boolean") {
      flags[feature.key] = values[feature.key] as boolean;
    }
  }
  return flags;
}

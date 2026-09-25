/**
 * Feature-Schlüssel (abhängigkeitsfrei, auch von Frontend-Tests importierbar).
 * Muss mit `src/config/features.ts` übereinstimmen – `src/config/feature-parity.test.ts` prüft das.
 * Kern-Features sind nicht abschaltbar.
 */
export const FEATURE_KEYS = [
  "dashboard", "auth", "profile", "notifications", "grows", "strains", "breeders", "social", "communities",
  "forum", "chat", "wiki", "hallOfFame", "marketplace", "ai", "telegram", "planner", "calculator",
  "consumption", "simulation", "report", "showcase", "devAdmin",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export const CORE_FEATURES: ReadonlySet<FeatureKey> = new Set(["dashboard", "auth", "profile", "notifications", "devAdmin"]);
export const isFeatureKey = (value: string): value is FeatureKey => (FEATURE_KEYS as readonly string[]).includes(value);


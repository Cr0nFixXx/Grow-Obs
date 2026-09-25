import { createMiddleware } from "hono/factory";
import { db } from "../db/client.ts";
import { featureFlags } from "../db/schema.ts";
import type { AuthEnv } from "../middleware/auth.ts";
import { CORE_FEATURES, isFeatureKey, type FeatureKey } from "./feature-keys.ts";

export { CORE_FEATURES, FEATURE_KEYS, isFeatureKey, type FeatureKey } from "./feature-keys.ts";

/** Globale Feature-Flags (B-49): Cache, Pfad-Zuordnung und Middleware. Schlüssel: feature-keys.ts. */
/** API-Pfad-Präfix → Feature. Nicht gelistete Pfade (auth, admin, media, tasks, health) sind immer frei. */
const ROUTE_FEATURES: [prefix: string, feature: FeatureKey][] = [
  ["/grows", "grows"], ["/strains", "strains"], ["/breeders", "breeders"], ["/social", "social"],
  ["/communities", "communities"], ["/forum", "forum"], ["/chat", "chat"], ["/wiki", "wiki"],
  ["/hall", "hallOfFame"], ["/products", "marketplace"], ["/offers", "marketplace"],
];
export function featureForPath(path: string): FeatureKey | null {
  const hit = ROUTE_FEATURES.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
  return hit ? hit[1] : null;
}

/** Kurzer Prozess-Cache: jede Anfrage liest sonst die Tabelle. Änderungen invalidieren sofort. */
const TTL_MS = 5000;
let cache: { at: number; overrides: Partial<Record<FeatureKey, boolean>> } | null = null;
export function invalidateFeatureCache() { cache = null; }

export async function getFeatureOverrides(): Promise<Partial<Record<FeatureKey, boolean>>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.overrides;
  const rows = await db.select({ key: featureFlags.key, enabled: featureFlags.enabled }).from(featureFlags);
  const overrides: Partial<Record<FeatureKey, boolean>> = {};
  for (const row of rows) if (isFeatureKey(row.key) && !CORE_FEATURES.has(row.key)) overrides[row.key] = row.enabled;
  cache = { at: Date.now(), overrides };
  return overrides;
}

/** Blockiert Routen deaktivierter Features mit 403 + maschinenlesbarem `feature`-Feld. */
export const requireFeature = createMiddleware<AuthEnv>(async (c, next) => {
  const feature = featureForPath(c.req.path);
  if (feature && (await getFeatureOverrides())[feature] === false) {
    return c.json({ error: "Diese Funktion ist derzeit deaktiviert", feature }, 403);
  }
  await next();
});

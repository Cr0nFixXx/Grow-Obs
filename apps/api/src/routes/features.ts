import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client.ts";
import { featureFlags } from "../db/schema.ts";
import { requireAuth, requirePlatformAdmin, type AuthEnv } from "../middleware/auth.ts";
import { CORE_FEATURES, getFeatureOverrides, invalidateFeatureCache, isFeatureKey } from "../lib/features.ts";

/** Öffentlich lesbar (auch vor dem Login): nur Overrides, keine Metadaten über Bearbeiter. */
export const featuresApi = new Hono<AuthEnv>();
featuresApi.get("/", async (c) => {
  c.header("Cache-Control", "no-store");
  return c.json({ overrides: await getFeatureOverrides() });
});

/** Plattform-Admin: globaler Schalter. */
export const adminFeaturesApi = new Hono<AuthEnv>();
adminFeaturesApi.use("*", requireAuth, requirePlatformAdmin);

adminFeaturesApi.put("/:key", async (c) => {
  const key = c.req.param("key");
  if (!isFeatureKey(key)) return c.json({ error: "Unbekanntes Feature" }, 404);
  if (CORE_FEATURES.has(key)) return c.json({ error: "Kern-Funktionen sind nicht abschaltbar" }, 409);
  const body = z.object({ enabled: z.boolean() }).strict().safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültige Daten" }, 400);
  const values = { key, enabled: body.data.enabled, updatedBy: c.get("userId"), updatedAt: new Date() };
  await db.insert(featureFlags).values(values)
    .onConflictDoUpdate({ target: featureFlags.key, set: { enabled: values.enabled, updatedBy: values.updatedBy, updatedAt: values.updatedAt } });
  invalidateFeatureCache();
  return c.json({ overrides: await getFeatureOverrides() });
});

/** Alle Overrides löschen → Datei-Defaults gelten wieder. */
adminFeaturesApi.delete("/", async (c) => {
  await db.delete(featureFlags);
  invalidateFeatureCache();
  return c.json({ overrides: {} });
});

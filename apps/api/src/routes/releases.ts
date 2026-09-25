import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import { appReleases } from "../db/schema.ts";
import { requireAuth, requirePlatformAdmin, type AuthEnv } from "../middleware/auth.ts";
import { isFeatureKey } from "../lib/feature-keys.ts";
import { uuid } from "../lib/validation.ts";

const toRelease = (r: typeof appReleases.$inferSelect) => ({
  id: r.id, version: r.version, title: r.title, notes: r.notes, severity: r.severity,
  features: r.features, publishedAt: r.publishedAt.toISOString(),
});

/** Öffentlich (auch vor Login, für Pflicht-Updates): neueste 20 Releases. */
export const releasesApi = new Hono<AuthEnv>();
releasesApi.get("/", async (c) => {
  c.header("Cache-Control", "no-store");
  const rows = await db.select().from(appReleases).orderBy(desc(appReleases.publishedAt)).limit(20);
  return c.json(rows.map(toRelease));
});

const releaseSchema = z.object({
  version: z.string().trim().min(1).max(30),
  title: z.string().trim().min(3).max(120),
  notes: z.array(z.string().trim().min(1).max(300)).min(1).max(20),
  severity: z.enum(["optional", "recommended", "required"]),
  features: z.array(z.string()).max(10).default([]).refine((keys) => keys.every(isFeatureKey), "Unbekanntes Feature"),
}).strict();

/** Plattform-Admin: veröffentlichen/löschen. */
export const adminReleasesApi = new Hono<AuthEnv>();
adminReleasesApi.use("*", requireAuth, requirePlatformAdmin);

adminReleasesApi.post("/", async (c) => {
  const body = releaseSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  const [row] = await db.insert(appReleases).values({ ...body.data, features: [...new Set(body.data.features)], createdBy: c.get("userId") }).returning();
  return c.json(toRelease(row), 201);
});

adminReleasesApi.delete("/:id", async (c) => {
  const deleted = await db.delete(appReleases).where(eq(appReleases.id, uuid(c.req.param("id")))).returning({ id: appReleases.id });
  if (!deleted.length) return c.json({ error: "Nicht gefunden" }, 404);
  return c.json({ ok: true });
});

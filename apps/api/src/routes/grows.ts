import { Hono } from "hono";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import { growEnv, growLogs, growPhotos, grows, strains } from "../db/schema.ts";
import { requireAuth, type AuthEnv } from "../middleware/auth.ts";
import { uuid } from "../lib/validation.ts";
import { imageRef } from "../lib/media-ref.ts";

export const growsApi = new Hono<AuthEnv>();

type GrowRow = typeof grows.$inferSelect;

/** Standard-Phasen aus der Gesamt-Dauer abgeleitet. */
function derivePhases(row: GrowRow) {
  const flowerEnd = Math.max(row.totalDays - 7, 35);
  return [
    { key: "germ", label: "Keimung", start: 0, end: 5, done: row.day >= 5 },
    { key: "veg", label: "Vegetativ", start: 5, end: 35, done: row.day >= 35 },
    { key: "flower", label: "Blüte", start: 35, end: flowerEnd, done: row.day >= flowerEnd },
    { key: "harvest", label: "Ernte", start: flowerEnd, end: row.totalDays, done: row.day >= row.totalDays },
  ];
}

/** Mappt eine Grow-Row auf den vollen Frontend-`Grow`-Shape. */
async function toGrow(row: GrowRow) {
  const strain = row.strainId
    ? await db.query.strains.findFirst({ where: eq(strains.id, row.strainId) })
    : undefined;
  const logs = await db.select().from(growLogs).where(eq(growLogs.growId, row.id)).orderBy(asc(growLogs.day));
  const photos = await db.select().from(growPhotos).where(eq(growPhotos.growId, row.id));
  const env = await db.select().from(growEnv).where(eq(growEnv.growId, row.id)).orderBy(asc(growEnv.day));
  return {
    id: row.id,
    name: row.name,
    strain: strain?.name ?? "Unbekannt",
    breeder: row.breeder,
    type: row.type,
    medium: row.medium,
    startDate: row.startDate,
    day: row.day,
    totalDays: row.totalDays,
    phase: row.phase,
    phaseIndex: row.phaseIndex,
    progress: row.progress,
    health: row.health,
    cover: row.coverUrl ?? "",
    gallery: photos.map((p) => p.url),
    expectedYield: row.expectedYield,
    phases: derivePhases(row),
    env: env.map((e) => ({ day: e.day, temp: e.temp, rh: e.rh, vpd: e.vpd, ec: e.ec })),
    logs: logs.map((l) => ({ id: l.id, day: l.day, date: l.date, title: l.title, text: l.body, tag: l.tag })),
  };
}

async function getOwnedGrow(id: string, userId: string) {
  uuid(id);
  const row = await db.query.grows.findFirst({ where: and(eq(grows.id, id), eq(grows.userId, userId)) });
  return row ? toGrow(row) : null;
}

growsApi.get("/", requireAuth, async (c) => {
  const rows = await db
    .select()
    .from(grows)
    .where(eq(grows.userId, c.get("userId")))
    .orderBy(desc(grows.createdAt)).limit(200);
  return c.json(await Promise.all(rows.map(toGrow)));
});

growsApi.get("/:id", requireAuth, async (c) => {
  const grow = await getOwnedGrow(c.req.param("id"), c.get("userId"));
  if (!grow) return c.json({ error: "Nicht gefunden" }, 404);
  return c.json(grow);
});

const createGrowSchema = z.object({
  name: z.string().trim().min(1).max(100),
  strain: z.string().max(100).optional(),
  breeder: z.string().max(100).default(""),
  type: z.enum(["Sativa", "Indica", "Hybrid"]).default("Hybrid"),
  medium: z.string().max(200).default(""),
});

growsApi.post("/", requireAuth, async (c) => {
  const body = createGrowSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  const { name, strain, breeder, type, medium } = body.data;
  const strainRow = strain
    ? await db.query.strains.findFirst({ where: eq(strains.name, strain) })
    : undefined;
  const [row] = await db
    .insert(grows)
    .values({
      userId: c.get("userId"),
      name,
      breeder,
      type,
      medium,
      strainId: strainRow?.id ?? null,
      startDate: new Date().toISOString().slice(0, 10),
    })
    .returning();
  return c.json(await toGrow(row), 201);
});

const addLogSchema = z.object({
  day: z.number().int().min(0).max(10000).default(0),
  date: z.string().max(100).default("heute"),
  title: z.string().trim().min(1).max(200),
  text: z.string().max(20000).default(""),
  tag: z.enum(["Gießen", "Dünger", "Training", "Beobachtung", "Schädling", "Ernte"]).default("Beobachtung"),
});

growsApi.post("/:id/photos", requireAuth, async (c) => {
  const body = z.object({ url: imageRef }).strict().safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  const grow = await getOwnedGrow(c.req.param("id"), c.get("userId"));
  if (!grow) return c.json({ error: "Nicht gefunden" }, 404);
  await db.insert(growPhotos).values({ growId: grow.id, url: body.data.url });
  // Erstes Foto wird Cover, sofern noch keins gesetzt ist.
  await db.update(grows).set({ coverUrl: body.data.url })
    .where(and(eq(grows.id, grow.id), sql`${grows.coverUrl} IS NULL`));
  return c.json(await toGrow((await db.query.grows.findFirst({ where: eq(grows.id, grow.id) }))!), 201);
});

growsApi.post("/:id/logs", requireAuth, async (c) => {
  const body = addLogSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  const exists = await getOwnedGrow(c.req.param("id"), c.get("userId"));
  if (!exists) return c.json({ error: "Nicht gefunden" }, 404);
  const [log] = await db
    .insert(growLogs)
    .values({
      growId: c.req.param("id"),
      day: body.data.day,
      date: body.data.date,
      title: body.data.title,
      body: body.data.text,
      tag: body.data.tag,
    })
    .returning();
  return c.json({ id: log.id, day: log.day, date: log.date, title: log.title, text: log.body, tag: log.tag }, 201);
});

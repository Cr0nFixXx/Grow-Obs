import { Hono } from "hono";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import { growEnv, growLogs, growPhotos, grows, strains } from "../db/schema.ts";
import { GROW_CONDITIONS, GROW_PHASES, growState, isIsoDate, todayIso, type GrowCondition, type GrowStatus } from "../lib/grow-state.ts";
import { releaseMedia } from "../lib/media-cleanup.ts";
import { requireAuth, type AuthEnv } from "../middleware/auth.ts";
import { uuid } from "../lib/validation.ts";
import { imageRef } from "../lib/media-ref.ts";

export const growsApi = new Hono<AuthEnv>();

type GrowRow = typeof grows.$inferSelect;

/** Mappt eine Grow-Row auf den vollen Frontend-`Grow`-Shape. */
async function toGrow(row: GrowRow) {
  const strain = row.strainId
    ? await db.query.strains.findFirst({ where: eq(strains.id, row.strainId) })
    : undefined;
  const logs = await db.select().from(growLogs).where(eq(growLogs.growId, row.id)).orderBy(asc(growLogs.day));
  const photos = await db.select().from(growPhotos).where(eq(growPhotos.growId, row.id));
  const env = await db.select().from(growEnv).where(eq(growEnv.growId, row.id)).orderBy(asc(growEnv.day));
  const state = growState(row);
  return {
    id: row.id,
    name: row.name,
    strain: row.strainName || strain?.name || "Unbekannt",
    breeder: row.breeder,
    type: row.type,
    medium: row.medium,
    startDate: row.startDate,
    day: state.day,
    totalDays: row.totalDays,
    phase: state.phase,
    phaseIndex: state.phaseIndex,
    progress: state.progress,
    status: row.status as GrowStatus,
    condition: row.condition as GrowCondition,
    archived: row.archivedAt !== null,
    endedOn: row.endedOn,
    harvest: row.status === "harvested" || row.status === "aborted"
      ? { wetG: row.wetWeightG, dryG: row.dryWeightG, note: row.harvestNote }
      : null,
    cover: row.coverUrl ?? "",
    gallery: photos.map((p) => p.url),
    expectedYield: row.expectedYield,
    phases: state.phases,
    env: env.map((e) => ({ day: e.day, temp: e.temp, rh: e.rh, vpd: e.vpd, ec: e.ec })),
    logs: logs.map((l) => ({ id: l.id, day: l.day, date: l.date, title: l.title, text: l.body, tag: l.tag })),
  };
}

async function getOwnedRow(id: string, userId: string) {
  uuid(id);
  return db.query.grows.findFirst({ where: and(eq(grows.id, id), eq(grows.userId, userId)) });
}

async function getOwnedGrow(id: string, userId: string) {
  const row = await getOwnedRow(id, userId);
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

const dateField = z.string().refine(isIsoDate, "Ungültiges Datum").refine((d) => d >= "2000-01-01" && d <= todayIso(), "Datum liegt in der Zukunft oder zu weit zurück");
const growFields = {
  name: z.string().trim().min(1, "Bitte einen Namen angeben").max(100),
  strain: z.string().trim().max(100),
  breeder: z.string().trim().max(100),
  type: z.enum(["Sativa", "Indica", "Hybrid"]),
  medium: z.string().trim().max(200),
  startDate: dateField,
  totalDays: z.number().int().min(14, "Mindestens 14 Tage").max(400, "Höchstens 400 Tage"),
  expectedYield: z.string().trim().max(60),
};
const createGrowSchema = z.object({
  name: growFields.name,
  strain: growFields.strain.optional(),
  breeder: growFields.breeder.default(""),
  type: growFields.type.default("Hybrid"),
  medium: growFields.medium.default(""),
  startDate: growFields.startDate.optional(),
  totalDays: growFields.totalDays.optional(),
}).strict();

/** Sorte: Name in der Datenbank suchen (Verknüpfung), der eingegebene Name bleibt in jedem Fall erhalten. */
async function findStrain(name: string | undefined) {
  if (!name) return undefined;
  return db.query.strains.findFirst({ where: eq(strains.name, name) });
}

growsApi.post("/", requireAuth, async (c) => {
  const body = createGrowSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  const { name, strain, breeder, type, medium } = body.data;
  const strainRow = await findStrain(strain);
  const startDate = body.data.startDate ?? todayIso();
  const [row] = await db
    .insert(grows)
    .values({
      userId: c.get("userId"),
      name,
      breeder,
      type,
      medium,
      strainId: strainRow?.id ?? null,
      strainName: strain ?? "",
      startDate,
      ...(body.data.totalDays ? { totalDays: body.data.totalDays } : {}),
      phaseDates: { [GROW_PHASES[0]]: startDate },
    })
    .returning();
  return c.json(await toGrow(row), 201);
});

const patchGrowSchema = z.object({
  name: growFields.name,
  strain: growFields.strain,
  breeder: growFields.breeder,
  type: growFields.type,
  medium: growFields.medium,
  startDate: growFields.startDate,
  totalDays: growFields.totalDays,
  expectedYield: growFields.expectedYield,
  condition: z.enum(GROW_CONDITIONS),
}).partial().strict();

growsApi.patch("/:id", requireAuth, async (c) => {
  const body = patchGrowSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  const row = await getOwnedRow(c.req.param("id"), c.get("userId"));
  if (!row) return c.json({ error: "Nicht gefunden" }, 404);
  const { strain, ...rest } = body.data;
  const patch: Partial<typeof grows.$inferInsert> = { ...rest, updatedAt: new Date() };
  if (strain !== undefined) {
    const strainRow = await findStrain(strain);
    patch.strainName = strain;
    patch.strainId = strainRow?.id ?? null;
  }
  const startDate = rest.startDate ?? row.startDate;
  if (row.endedOn && startDate > row.endedOn) return c.json({ error: "Startdatum liegt nach dem Ende des Grows" }, 400);
  if (rest.startDate) patch.phaseDates = { ...row.phaseDates, [GROW_PHASES[0]]: rest.startDate };
  const [updated] = await db.update(grows).set(patch).where(eq(grows.id, row.id)).returning();
  return c.json(await toGrow(updated));
});

growsApi.post("/:id/phase", requireAuth, async (c) => {
  const body = z.object({ phase: z.enum(GROW_PHASES) }).strict().safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültige Phase" }, 400);
  const row = await getOwnedRow(c.req.param("id"), c.get("userId"));
  if (!row) return c.json({ error: "Nicht gefunden" }, 404);
  if (row.status !== "active") return c.json({ error: "Der Grow ist abgeschlossen – bitte zuerst wieder aufnehmen" }, 409);
  const phase = body.data.phase;
  const phaseDates = { ...row.phaseDates };
  phaseDates[phase] ??= todayIso() < row.startDate ? row.startDate : todayIso();
  const [updated] = await db.update(grows)
    .set({ phase, phaseIndex: GROW_PHASES.indexOf(phase), phaseDates, updatedAt: new Date() })
    .where(eq(grows.id, row.id)).returning();
  return c.json(await toGrow(updated));
});

const finishSchema = z.object({
  outcome: z.enum(["harvested", "aborted"]),
  date: dateField.optional(),
  wetG: z.number().int().min(0).max(1_000_000).nullable().optional(),
  dryG: z.number().int().min(0).max(1_000_000).nullable().optional(),
  note: z.string().trim().max(2000).optional(),
}).strict();

growsApi.post("/:id/finish", requireAuth, async (c) => {
  const body = finishSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  const row = await getOwnedRow(c.req.param("id"), c.get("userId"));
  if (!row) return c.json({ error: "Nicht gefunden" }, 404);
  const { outcome, wetG, dryG, note } = body.data;
  const endedOn = body.data.date ?? row.endedOn ?? todayIso();
  if (endedOn < row.startDate) return c.json({ error: "Das Datum liegt vor dem Start des Grows" }, 400);
  if (wetG != null && dryG != null && dryG > wetG) return c.json({ error: "Trockengewicht kann nicht größer als das Nassgewicht sein" }, 400);
  const harvested = outcome === "harvested";
  const [updated] = await db.update(grows).set({
    status: outcome,
    endedOn,
    wetWeightG: harvested ? (wetG !== undefined ? wetG : row.wetWeightG) : null,
    dryWeightG: harvested ? (dryG !== undefined ? dryG : row.dryWeightG) : null,
    harvestNote: note ?? row.harvestNote,
    updatedAt: new Date(),
  }).where(eq(grows.id, row.id)).returning();
  return c.json(await toGrow(updated));
});

growsApi.post("/:id/reopen", requireAuth, async (c) => {
  const row = await getOwnedRow(c.req.param("id"), c.get("userId"));
  if (!row) return c.json({ error: "Nicht gefunden" }, 404);
  const [updated] = await db.update(grows).set({ status: "active", endedOn: null, updatedAt: new Date() }).where(eq(grows.id, row.id)).returning();
  return c.json(await toGrow(updated));
});

for (const [action, archived] of [["archive", true], ["unarchive", false]] as const) {
  growsApi.post(`/:id/${action}`, requireAuth, async (c) => {
    const row = await getOwnedRow(c.req.param("id"), c.get("userId"));
    if (!row) return c.json({ error: "Nicht gefunden" }, 404);
    const [updated] = await db.update(grows)
      .set({ archivedAt: archived ? (row.archivedAt ?? new Date()) : null, updatedAt: new Date() })
      .where(eq(grows.id, row.id)).returning();
    return c.json(await toGrow(updated));
  });
}

/** Endgültig löschen: Einträge, Messwerte, Fotos; die Bilder auch aus dem Speicher (sofern nirgends sonst verwendet). */
growsApi.delete("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const row = await getOwnedRow(c.req.param("id"), userId);
  if (!row) return c.body(null, 204); // idempotent
  const photos = await db.select({ url: growPhotos.url }).from(growPhotos).where(eq(growPhotos.growId, row.id));
  await db.transaction(async (tx) => {
    await tx.delete(growEnv).where(eq(growEnv.growId, row.id));
    await tx.delete(growLogs).where(eq(growLogs.growId, row.id));
    await tx.delete(growPhotos).where(eq(growPhotos.growId, row.id));
    await tx.delete(grows).where(eq(grows.id, row.id));
  });
  for (const url of new Set([row.coverUrl, ...photos.map((p) => p.url)])) await releaseMedia(userId, url);
  return c.body(null, 204);
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

import { Hono } from "hono";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import { growEnv, growLogs, growPhotos, grows, strains } from "../db/schema.ts";
import { GROW_CONDITIONS, GROW_PHASES, dayDiff, growState, isIsoDate, todayIso, vpdKpa, type GrowCondition, type GrowStatus } from "../lib/grow-state.ts";
import { releaseMedia } from "../lib/media-cleanup.ts";
import { requireAuth, type AuthEnv } from "../middleware/auth.ts";
import { uuid } from "../lib/validation.ts";
import { imageRef } from "../lib/media-ref.ts";

export const growsApi = new Hono<AuthEnv>();

type GrowRow = typeof grows.$inferSelect;

/** Zielbereich aus zwei nullable Spalten; unvollständig = kein Zielbereich. */
const range = (min: number | null, max: number | null) => (min !== null && max !== null ? { min, max } : null);

/** Mappt eine Grow-Row auf den vollen Frontend-`Grow`-Shape. */
async function toGrow(row: GrowRow) {
  const strain = row.strainId
    ? await db.query.strains.findFirst({ where: eq(strains.id, row.strainId) })
    : undefined;
  const logs = await db.select().from(growLogs).where(eq(growLogs.growId, row.id)).orderBy(desc(growLogs.loggedOn), desc(growLogs.createdAt));
  const photos = await db.select().from(growPhotos).where(eq(growPhotos.growId, row.id)).orderBy(asc(growPhotos.takenAt), asc(growPhotos.id));
  const env = await db.select().from(growEnv).where(eq(growEnv.growId, row.id)).orderBy(asc(growEnv.loggedOn));
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
    photos: photos.map((p) => ({ id: p.id, url: p.url, caption: p.caption, cover: p.url === row.coverUrl })),
    leafOffset: row.leafOffset,
    targets: {
      ph: range(row.phMin, row.phMax),
      ec: range(row.ecMin, row.ecMax),
    },
    expectedYield: row.expectedYield,
    phases: state.phases,
    env: env.map((e) => toEnv(e, row)),
    logs: logs.map((l) => toLog(l, row.startDate)),
  };
}

type LogRow = typeof growLogs.$inferSelect;
type EnvRow = typeof growEnv.$inferSelect;

/** Log-Eintrag für das Frontend; der Tag ergibt sich aus Datum und Startdatum (nicht mehr aus dem gespeicherten Wert). */
function toLog(l: LogRow, startDate: string) {
  return { id: l.id, day: dayDiff(startDate, l.loggedOn), date: l.loggedOn, title: l.title, text: l.body, tag: l.tag };
}

/** Messpunkt; das VPD wird aus Temperatur, Luftfeuchte und dem Blatt-Abzug des Grows berechnet (nie gespeichert). */
function toEnv(e: EnvRow, row: GrowRow) {
  return {
    day: dayDiff(row.startDate, e.loggedOn),
    date: e.loggedOn,
    temp: e.temp,
    rh: e.rh,
    vpd: e.temp !== null && e.rh !== null ? vpdKpa(e.temp, e.rh, row.leafOffset) : null,
    ec: e.ec,
    ph: e.ph,
  };
}

const LOG_TAGS = ["Gießen", "Dünger", "Training", "Beobachtung", "Schädling", "Ernte"] as const;

/** Datum für Tagebuch und Messwerte: gültig, nicht vor dem Start, nicht in der Zukunft. */
function diaryDateError(row: GrowRow, date: string): string | null {
  if (!isIsoDate(date)) return "Ungültiges Datum";
  if (date < row.startDate) return "Das Datum liegt vor dem Start des Grows";
  if (date > todayIso()) return "Das Datum liegt in der Zukunft";
  return null;
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

/** Zielbereich im Request: `{min, max}` oder `null` (Band aus). */
const targetRange = (label: string, lo: number, hi: number) =>
  z.object({
    min: z.number().min(lo, `${label} zwischen ${lo} und ${hi}`).max(hi, `${label} zwischen ${lo} und ${hi}`),
    max: z.number().min(lo, `${label} zwischen ${lo} und ${hi}`).max(hi, `${label} zwischen ${lo} und ${hi}`),
  }).strict().refine((r) => r.min < r.max, `${label}: Minimum muss kleiner als das Maximum sein`).nullable();

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
  leafOffset: z.number().min(0, "Abzug zwischen 0 und 6 °C").max(6, "Abzug zwischen 0 und 6 °C"),
  targets: z.object({ ph: targetRange("pH", 0, 14).optional(), ec: targetRange("EC", 0, 10).optional() }).strict(),
}).partial().strict();

growsApi.patch("/:id", requireAuth, async (c) => {
  const body = patchGrowSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  const row = await getOwnedRow(c.req.param("id"), c.get("userId"));
  if (!row) return c.json({ error: "Nicht gefunden" }, 404);
  const { strain, targets, ...rest } = body.data;
  const patch: Partial<typeof grows.$inferInsert> = { ...rest, updatedAt: new Date() };
  if (targets?.ph !== undefined) { patch.phMin = targets.ph?.min ?? null; patch.phMax = targets.ph?.max ?? null; }
  if (targets?.ec !== undefined) { patch.ecMin = targets.ec?.min ?? null; patch.ecMax = targets.ec?.max ?? null; }
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

const logFields = {
  title: z.string().trim().min(1, "Bitte einen Titel angeben").max(200),
  text: z.string().max(20000),
  tag: z.enum(LOG_TAGS),
  date: z.string().max(10),
};
// `day` wird von älteren Clients noch mitgeschickt und ignoriert (der Tag ergibt sich aus dem Datum).
const addLogSchema = z.object({ ...logFields, text: logFields.text.default(""), tag: logFields.tag.default("Beobachtung"), date: logFields.date.optional(), day: z.number().optional() }).strict();
const patchLogSchema = z.object(logFields).partial().strict();

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
  const row = await getOwnedRow(c.req.param("id"), c.get("userId"));
  if (!row) return c.json({ error: "Nicht gefunden" }, 404);
  const date = body.data.date ?? todayIso();
  const problem = diaryDateError(row, date);
  if (problem) return c.json({ error: problem }, 400);
  const [log] = await db
    .insert(growLogs)
    .values({
      growId: row.id,
      day: dayDiff(row.startDate, date),
      date,
      loggedOn: date,
      title: body.data.title,
      body: body.data.text,
      tag: body.data.tag,
    })
    .returning();
  return c.json(toLog(log, row.startDate), 201);
});

async function getOwnedLog(growId: string, logId: string, userId: string) {
  const row = await getOwnedRow(growId, userId);
  if (!row) return { row: null, log: null };
  uuid(logId);
  const log = await db.query.growLogs.findFirst({ where: and(eq(growLogs.id, logId), eq(growLogs.growId, row.id)) });
  return { row, log: log ?? null };
}

growsApi.patch("/:id/logs/:logId", requireAuth, async (c) => {
  const body = patchLogSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  const { row, log } = await getOwnedLog(c.req.param("id"), c.req.param("logId"), c.get("userId"));
  if (!row || !log) return c.json({ error: "Nicht gefunden" }, 404);
  const { text, date, ...rest } = body.data;
  if (date !== undefined) {
    const problem = diaryDateError(row, date);
    if (problem) return c.json({ error: problem }, 400);
  }
  const changes = {
    ...rest,
    ...(text !== undefined ? { body: text } : {}),
    ...(date !== undefined ? { date, loggedOn: date, day: dayDiff(row.startDate, date) } : {}),
  };
  if (Object.keys(changes).length === 0) return c.json(toLog(log, row.startDate));
  const [updated] = await db.update(growLogs).set(changes).where(eq(growLogs.id, log.id)).returning();
  return c.json(toLog(updated, row.startDate));
});

growsApi.delete("/:id/logs/:logId", requireAuth, async (c) => {
  const { row, log } = await getOwnedLog(c.req.param("id"), c.req.param("logId"), c.get("userId"));
  if (!row) return c.json({ error: "Nicht gefunden" }, 404);
  if (log) await db.delete(growLogs).where(eq(growLogs.id, log.id));
  return c.body(null, 204); // idempotent
});

/* ------------------------------ Fotos ------------------------------ */

async function getOwnedPhoto(growId: string, photoId: string, userId: string) {
  const row = await getOwnedRow(growId, userId);
  if (!row) return { row: null, photo: null };
  uuid(photoId);
  const photo = await db.query.growPhotos.findFirst({ where: and(eq(growPhotos.id, photoId), eq(growPhotos.growId, row.id)) });
  return { row, photo: photo ?? null };
}

const patchPhotoSchema = z.object({ caption: z.string().trim().max(200, "Höchstens 200 Zeichen"), cover: z.literal(true) }).partial().strict();

growsApi.patch("/:id/photos/:photoId", requireAuth, async (c) => {
  const body = patchPhotoSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  const { row, photo } = await getOwnedPhoto(c.req.param("id"), c.req.param("photoId"), c.get("userId"));
  if (!row || !photo) return c.json({ error: "Nicht gefunden" }, 404);
  await db.transaction(async (tx) => {
    if (body.data.caption !== undefined) await tx.update(growPhotos).set({ caption: body.data.caption }).where(eq(growPhotos.id, photo.id));
    if (body.data.cover) await tx.update(grows).set({ coverUrl: photo.url, updatedAt: new Date() }).where(eq(grows.id, row.id));
  });
  return c.json(await toGrow((await db.query.grows.findFirst({ where: eq(grows.id, row.id) }))!));
});

growsApi.delete("/:id/photos/:photoId", requireAuth, async (c) => {
  const userId = c.get("userId");
  const { row, photo } = await getOwnedPhoto(c.req.param("id"), c.req.param("photoId"), userId);
  if (!row || !photo) return c.json({ error: "Nicht gefunden" }, 404);
  await db.transaction(async (tx) => {
    await tx.delete(growPhotos).where(eq(growPhotos.id, photo.id));
    // War es das Titelbild, rückt das nächste Foto nach (ohne Foto: kein Titelbild).
    if (row.coverUrl === photo.url) {
      const [next] = await tx.select({ url: growPhotos.url }).from(growPhotos).where(eq(growPhotos.growId, row.id)).orderBy(asc(growPhotos.takenAt), asc(growPhotos.id)).limit(1);
      await tx.update(grows).set({ coverUrl: next?.url ?? null, updatedAt: new Date() }).where(eq(grows.id, row.id));
    }
  });
  await releaseMedia(userId, photo.url);
  return c.json(await toGrow((await db.query.grows.findFirst({ where: eq(grows.id, row.id) }))!));
});

/* ------------------------------ Messwerte (ein Eintrag je Tag) ------------------------------ */

const measure = (min: number, max: number, label: string) => z.number().min(min, `${label}: ${min} bis ${max}`).max(max, `${label}: ${min} bis ${max}`).nullable().optional();
const envSchema = z.object({
  date: z.string().max(10).optional(),
  temp: measure(-10, 60, "Temperatur (°C)"),
  rh: measure(0, 100, "Luftfeuchte (%)"),
  ec: measure(0, 10, "EC (mS/cm)"),
  ph: measure(0, 14, "pH"),
}).strict();

/** Ein Wert auf zwei Nachkommastellen; `undefined` und `null` werden zu `null`. */
const round2 = (value: number | null | undefined) => (value == null ? null : Math.round(value * 100) / 100);

growsApi.put("/:id/env", requireAuth, async (c) => {
  const body = envSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  const row = await getOwnedRow(c.req.param("id"), c.get("userId"));
  if (!row) return c.json({ error: "Nicht gefunden" }, 404);
  const date = body.data.date ?? todayIso();
  const problem = diaryDateError(row, date);
  if (problem) return c.json({ error: problem }, 400);
  const values = { temp: round2(body.data.temp), rh: round2(body.data.rh), ec: round2(body.data.ec), ph: round2(body.data.ph) };
  if (Object.values(values).every((v) => v === null)) return c.json({ error: "Bitte mindestens einen Messwert angeben" }, 400);
  // Einer je Tag: erneutes Speichern ersetzt den Eintrag (PUT = vollständiger Ersatz).
  const [saved] = await db.insert(growEnv)
    .values({ growId: row.id, day: dayDiff(row.startDate, date), loggedOn: date, ...values })
    .onConflictDoUpdate({ target: [growEnv.growId, growEnv.loggedOn], set: { day: dayDiff(row.startDate, date), ...values } })
    .returning();
  return c.json(toEnv(saved, row));
});

growsApi.delete("/:id/env/:date", requireAuth, async (c) => {
  const row = await getOwnedRow(c.req.param("id"), c.get("userId"));
  if (!row) return c.json({ error: "Nicht gefunden" }, 404);
  const date = c.req.param("date");
  if (!isIsoDate(date)) return c.json({ error: "Ungültiges Datum" }, 400);
  await db.delete(growEnv).where(and(eq(growEnv.growId, row.id), eq(growEnv.loggedOn, date)));
  return c.body(null, 204); // idempotent
});

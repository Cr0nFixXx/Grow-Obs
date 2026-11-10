import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import { growEnv, growLogs, growPhotos, growStrainEnv, grows, strains, type GrowStrainRow } from "../db/schema.ts";
import { GROW_SITES, deriveGrowType, duplicateStrain, growStrainsSchema, removedStrainIds, strainIdsField, strainTexts, strainsOf, plantEnvError, unknownStrainIds, weightTotals, withStrainIds } from "../lib/grow-strains.ts";
import { GROW_CONDITIONS, GROW_PHASES, dayDiff, growState, isIsoDate, todayIso, vpdKpa, type GrowCondition, type GrowStatus } from "../lib/grow-state.ts";
import { releaseMedia } from "../lib/media-cleanup.ts";
import { requireAuth, type AuthEnv } from "../middleware/auth.ts";
import { uuid } from "../lib/validation.ts";
import { imageRef } from "../lib/media-ref.ts";

export const growsApi = new Hono<AuthEnv>();

type GrowRow = typeof grows.$inferSelect;

export const GROW_VISIBILITIES = ["private", "public", "community"] as const;
export type GrowVisibility = (typeof GROW_VISIBILITIES)[number];

/** Größen mit Zielbereich (Standard je Phase im Frontend; hier nur die Überschreibungen, B-88). */
const TARGET_KEYS = ["ph", "ec", "temp", "rh", "vpd"] as const;
const TARGET_LIMITS: Record<(typeof TARGET_KEYS)[number], { label: string; lo: number; hi: number }> = {
  ph: { label: "pH", lo: 0, hi: 14 },
  ec: { label: "EC", lo: 0, hi: 10 },
  temp: { label: "Temperatur", lo: 0, hi: 50 },
  rh: { label: "Luftfeuchte", lo: 0, hi: 100 },
  vpd: { label: "VPD", lo: 0, hi: 5 },
};

/** Gespeicherte Überschreibungen für die Antwort: nur bekannte Schlüssel mit gültigem Wert. */
function cleanTargets(raw: unknown): Record<string, { min: number; max: number } | null> {
  const out: Record<string, { min: number; max: number } | null> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const key of TARGET_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (v === null) out[key] = null;
    else if (v && typeof v === "object" && typeof (v as { min?: unknown }).min === "number" && typeof (v as { max?: unknown }).max === "number") {
      out[key] = { min: (v as { min: number }).min, max: (v as { max: number }).max };
    }
  }
  return out;
}

/** Mappt eine Grow-Row auf den vollen Frontend-`Grow`-Shape. */
export async function toGrow(row: GrowRow) {
  const strain = row.strainId
    ? await db.query.strains.findFirst({ where: eq(strains.id, row.strainId) })
    : undefined;
  const logs = await db.select().from(growLogs).where(eq(growLogs.growId, row.id)).orderBy(desc(growLogs.loggedOn), desc(growLogs.createdAt));
  const photos = await db.select().from(growPhotos).where(eq(growPhotos.growId, row.id)).orderBy(asc(growPhotos.takenAt), asc(growPhotos.id));
  const env = await db.select().from(growEnv).where(eq(growEnv.growId, row.id)).orderBy(asc(growEnv.loggedOn));
  const strainEnv = await db.select().from(growStrainEnv).where(eq(growStrainEnv.growId, row.id)).orderBy(asc(growStrainEnv.loggedOn), asc(growStrainEnv.plant));
  const state = growState(row);
  return {
    id: row.id,
    name: row.name,
    strain: row.strainName || strain?.name || "Unbekannt",
    strains: strainsOf(row),
    breeder: row.breeder,
    type: row.type,
    medium: row.medium,
    site: row.site,
    startDate: row.startDate,
    day: state.day,
    totalDays: row.totalDays,
    phase: state.phase,
    phaseIndex: state.phaseIndex,
    progress: state.progress,
    status: row.status as GrowStatus,
    visibility: row.visibility as GrowVisibility,
    condition: row.condition as GrowCondition,
    archived: row.archivedAt !== null,
    endedOn: row.endedOn,
    harvest: row.status === "harvested" || row.status === "aborted"
      ? { wetG: row.wetWeightG, dryG: row.dryWeightG, note: row.harvestNote }
      : null,
    cover: row.coverUrl ?? "",
    gallery: photos.map((p) => p.url),
    photos: photos.map((p) => ({ id: p.id, url: p.url, caption: p.caption, cover: p.url === row.coverUrl, strainIds: p.strainIds, date: todayIso(p.takenAt), day: dayDiff(row.startDate, todayIso(p.takenAt)) })),
    leafOffset: row.leafOffset,
    targets: cleanTargets(row.targets),
    expectedYield: row.expectedYield,
    phases: state.phases,
    env: env.map((e) => toEnv(e, row)),
    /** B-101: pH/EC je Sorte (Temperatur/Luftfeuchte stehen in `env` und gelten für den ganzen Grow). */
    strainEnv: strainEnv.map((e) => ({ day: dayDiff(row.startDate, e.loggedOn), date: e.loggedOn, strainId: e.strainId, plant: e.plant, ph: e.ph, ec: e.ec })),
    logs: logs.map((l) => toLog(l, row.startDate)),
  };
}

type LogRow = typeof growLogs.$inferSelect;
type EnvRow = typeof growEnv.$inferSelect;

/** Log-Eintrag für das Frontend; der Tag ergibt sich aus Datum und Startdatum (nicht mehr aus dem gespeicherten Wert). */
function toLog(l: LogRow, startDate: string) {
  return { id: l.id, day: dayDiff(startDate, l.loggedOn), date: l.loggedOn, title: l.title, text: l.body, tag: l.tag, strainIds: l.strainIds };
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
  /** B-100: mehrere Sorten; hat Vorrang vor `strain`/`breeder`. */
  strains: growStrainsSchema.optional(),
  breeder: growFields.breeder.default(""),
  /** Ohne Angabe aus den Genetik-Angaben der Sorten abgeleitet, sonst Hybrid. */
  type: growFields.type.optional(),
  medium: growFields.medium.default(""),
  /** B-105: Indoor/Outdoor, freiwillig. */
  site: z.enum(GROW_SITES).nullable().optional(),
  startDate: growFields.startDate.optional(),
  totalDays: growFields.totalDays.optional(),
  /** B-102: Sichtbarkeit gleich beim Anlegen (Standard privat). */
  visibility: z.enum(GROW_VISIBILITIES).default("private"),
}).strict();

/** Sorte: Name in der Datenbank suchen (Verknüpfung), der eingegebene Name bleibt in jedem Fall erhalten. */
async function findStrain(name: string | undefined) {
  if (!name) return undefined;
  return db.query.strains.findFirst({ where: eq(strains.name, name) });
}

growsApi.post("/", requireAuth, async (c) => {
  const body = createGrowSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  const { name, medium } = body.data;
  // Sortenliste: `strains` hat Vorrang; die alten Felder `strain`/`breeder` ergeben genau eine Sorte.
  const list: GrowStrainRow[] = withStrainIds(body.data.strains ?? (body.data.strain ? [{ name: body.data.strain, breeder: body.data.breeder === "Unbekannt" ? "" : body.data.breeder, plants: null, wetG: null, dryG: null }] : []), []);
  const dup = duplicateStrain(list);
  if (dup) return c.json({ error: dup }, 400);
  const type = body.data.type ?? deriveGrowType(list) ?? "Hybrid";
  const texts = strainTexts(list);
  const breeder = body.data.strains ? texts.breeder : body.data.breeder;
  const strainRow = await findStrain(list[0]?.name);
  const startDate = body.data.startDate ?? todayIso();
  const [row] = await db
    .insert(grows)
    .values({
      userId: c.get("userId"),
      name,
      breeder,
      type,
      medium,
      site: body.data.site ?? null,
      strainId: strainRow?.id ?? null,
      strainName: texts.strainName,
      strainList: list,
      startDate,
      visibility: body.data.visibility,
      ...(body.data.totalDays ? { totalDays: body.data.totalDays } : {}),
      phaseDates: { [GROW_PHASES[0]]: startDate },
    })
    .returning();
  return c.json(await toGrow(row), 201);
});

/** Zielbereich im Request: `{min, max}`, `null` (kein Ziel) oder `"default"` (zurück auf den Standard der Phase). */
const targetRange = (key: keyof typeof TARGET_LIMITS) => {
  const { label, lo, hi } = TARGET_LIMITS[key];
  const bound = z.number().min(lo, `${label} zwischen ${lo} und ${hi}`).max(hi, `${label} zwischen ${lo} und ${hi}`);
  return z.union([
    z.object({ min: bound, max: bound }).strict().refine((r) => r.min < r.max, `${label}: Minimum muss kleiner als das Maximum sein`),
    z.null(),
    z.literal("default"),
  ]);
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** B-101: Zuordnungen entfernter Sorten lösen – Einträge/Fotos werden „ganzer Grow“, pH/EC wandert in die Tageswerte des Grows (ein vorhandener Wert dort hat Vorrang). */
async function releaseStrainRefs(tx: Tx, row: GrowRow, removed: string[]) {
  if (removed.length === 0) return;
  const gone = new Set(removed);
  const logs = await tx.select({ id: growLogs.id, ids: growLogs.strainIds }).from(growLogs).where(eq(growLogs.growId, row.id));
  for (const l of logs) if (l.ids.some((i) => gone.has(i))) await tx.update(growLogs).set({ strainIds: l.ids.filter((i) => !gone.has(i)) }).where(eq(growLogs.id, l.id));
  const photos = await tx.select({ id: growPhotos.id, ids: growPhotos.strainIds }).from(growPhotos).where(eq(growPhotos.growId, row.id));
  for (const p of photos) if (p.ids.some((i) => gone.has(i))) await tx.update(growPhotos).set({ strainIds: p.ids.filter((i) => !gone.has(i)) }).where(eq(growPhotos.id, p.id));
  // B-104: nur Werte der ganzen Sorte (plant 0) wandern in den Grow; Werte einzelner Pflanzen entfallen mit der Sorte.
  const rows = await tx.select().from(growStrainEnv).where(and(eq(growStrainEnv.growId, row.id), inArray(growStrainEnv.strainId, removed), eq(growStrainEnv.plant, 0))).orderBy(asc(growStrainEnv.loggedOn), asc(growStrainEnv.id));
  for (const r of rows) {
    const [whole] = await tx.select().from(growEnv).where(and(eq(growEnv.growId, row.id), eq(growEnv.loggedOn, r.loggedOn)));
    if (whole) await tx.update(growEnv).set({ ph: whole.ph ?? r.ph, ec: whole.ec ?? r.ec }).where(eq(growEnv.id, whole.id));
    else await tx.insert(growEnv).values({ growId: row.id, day: dayDiff(row.startDate, r.loggedOn), loggedOn: r.loggedOn, ph: r.ph, ec: r.ec });
  }
  await tx.delete(growStrainEnv).where(and(eq(growStrainEnv.growId, row.id), inArray(growStrainEnv.strainId, removed)));
}

const patchGrowSchema = z.object({
  name: growFields.name,
  strain: growFields.strain,
  strains: growStrainsSchema,
  breeder: growFields.breeder,
  type: growFields.type,
  medium: growFields.medium,
  site: z.enum(GROW_SITES).nullable(),
  startDate: growFields.startDate,
  totalDays: growFields.totalDays,
  expectedYield: growFields.expectedYield,
  condition: z.enum(GROW_CONDITIONS),
  visibility: z.enum(GROW_VISIBILITIES),
  leafOffset: z.number().min(0, "Abzug zwischen 0 und 6 °C").max(6, "Abzug zwischen 0 und 6 °C"),
  targets: z.object({ ph: targetRange("ph").optional(), ec: targetRange("ec").optional(), temp: targetRange("temp").optional(), rh: targetRange("rh").optional(), vpd: targetRange("vpd").optional() }).strict(),
}).partial().strict();

growsApi.patch("/:id", requireAuth, async (c) => {
  const body = patchGrowSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  const row = await getOwnedRow(c.req.param("id"), c.get("userId"));
  if (!row) return c.json({ error: "Nicht gefunden" }, 404);
  const { strain, strains: strainsRaw, targets, ...rest } = body.data;
  const before = strainsOf(row);
  const strainsIn = strainsRaw ? withStrainIds(strainsRaw, before) : undefined;
  let after: GrowStrainRow[] | null = null;
  const patch: Partial<typeof grows.$inferInsert> = { ...rest, updatedAt: new Date() };
  if (targets) {
    const next = cleanTargets(row.targets);
    for (const key of TARGET_KEYS) {
      const v = targets[key];
      if (v === undefined) continue;
      if (v === "default") delete next[key];
      else next[key] = v;
    }
    patch.targets = next;
  }
  if (strainsIn !== undefined) {
    const dup = duplicateStrain(strainsIn);
    if (dup) return c.json({ error: dup }, 400);
    const texts = strainTexts(strainsIn);
    const strainRow = await findStrain(strainsIn[0]?.name);
    patch.strainList = strainsIn;
    after = strainsIn;
    // B-105: der Grow-Typ folgt den Genetik-Angaben der Sorten (ein ausdrücklich mitgeschickter Typ gewinnt).
    const derived = deriveGrowType(strainsIn);
    if (derived && rest.type === undefined) patch.type = derived;
    patch.strainName = texts.strainName;
    patch.breeder = texts.breeder;
    patch.strainId = strainRow?.id ?? null;
    // Stehen Gewichte je Sorte in der Liste, bilden ihre Summen die Gesamtgewichte des Grows.
    if (strainsIn.some((x) => x.wetG !== null || x.dryG !== null)) {
      const totals = weightTotals(strainsIn);
      patch.wetWeightG = totals.wetG;
      patch.dryWeightG = totals.dryG;
    }
  } else if (strain !== undefined) {
    // Alter Weg: ein Sortenname ersetzt die Liste durch genau diese Sorte (Breeder bleibt, falls vorhanden).
    const strainRow = await findStrain(strain);
    const current = strainsOf(row);
    const breederText = (rest.breeder ?? row.breeder) === "Unbekannt" ? "" : (rest.breeder ?? row.breeder);
    patch.strainName = strain;
    patch.strainId = strainRow?.id ?? null;
    patch.strainList = strain ? [{ id: current.length === 1 ? current[0].id : randomUUID(), name: strain, breeder: breederText, plants: current.length === 1 ? current[0].plants : null, wetG: current.length === 1 ? current[0].wetG : null, dryG: current.length === 1 ? current[0].dryG : null }] : [];
    after = patch.strainList;
  }
  const startDate = rest.startDate ?? row.startDate;
  if (row.endedOn && startDate > row.endedOn) return c.json({ error: "Startdatum liegt nach dem Ende des Grows" }, 400);
  if (rest.startDate) patch.phaseDates = { ...row.phaseDates, [GROW_PHASES[0]]: rest.startDate };
  const updated = await db.transaction(async (tx) => {
    const [u] = await tx.update(grows).set(patch).where(eq(grows.id, row.id)).returning();
    // B-101: entfernte Sorten – ihre Einträge, Fotos und pH/EC-Werte gelten danach für den ganzen Grow.
    if (after) await releaseStrainRefs(tx, row, removedStrainIds(before, after));
    // B-104: weniger Pflanzen (oder keine Zahl mehr) → pH/EC der nicht mehr vorhandenen Einzelpflanzen entfallen.
    if (after) for (const st of after) await tx.delete(growStrainEnv).where(and(eq(growStrainEnv.growId, row.id), eq(growStrainEnv.strainId, st.id), gt(growStrainEnv.plant, st.plants ?? 0)));
    return u;
  });
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
  /** B-100: Gewichte je Sorte, in der Reihenfolge der Sortenliste (gleiche Länge). */
  strainWeights: z.array(z.object({ wetG: z.number().int().min(0).max(1_000_000).nullable(), dryG: z.number().int().min(0).max(1_000_000).nullable() }).strict()).max(20).optional(),
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
  let list = strainsOf(row);
  let wetOut = wetG !== undefined ? wetG : row.wetWeightG;
  let dryOut = dryG !== undefined ? dryG : row.dryWeightG;
  const weights = body.data.strainWeights;
  if (weights !== undefined) {
    if (weights.length !== list.length) return c.json({ error: "Die Gewichte passen nicht zur Sortenliste" }, 400);
    const bad = weights.findIndex((w) => w.wetG !== null && w.dryG !== null && w.dryG > w.wetG);
    if (bad >= 0) return c.json({ error: `${list[bad].name}: Trockengewicht kann nicht größer als das Nassgewicht sein` }, 400);
    list = list.map((s, i) => ({ ...s, wetG: harvested ? weights[i].wetG : null, dryG: harvested ? weights[i].dryG : null }));
    const totals = weightTotals(list);
    wetOut = totals.wetG;
    dryOut = totals.dryG;
  } else if (list.length === 1 && (wetG !== undefined || dryG !== undefined)) {
    // Eine Sorte: die Gesamtgewichte gelten für sie.
    list = [{ ...list[0], wetG: harvested ? wetOut : null, dryG: harvested ? dryOut : null }];
  }
  if (!harvested) list = list.map((s) => ({ ...s, wetG: null, dryG: null }));
  const [updated] = await db.update(grows).set({
    status: outcome,
    endedOn,
    wetWeightG: harvested ? wetOut : null,
    dryWeightG: harvested ? dryOut : null,
    strainList: list.length ? list : row.strainList,
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
    await tx.delete(growStrainEnv).where(eq(growStrainEnv.growId, row.id));
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
  /** B-101: Sorten-IDs; leer = ganzer Grow. */
  strainIds: strainIdsField,
};
// `day` wird von älteren Clients noch mitgeschickt und ignoriert (der Tag ergibt sich aus dem Datum).
const addLogSchema = z.object({ ...logFields, text: logFields.text.default(""), tag: logFields.tag.default("Beobachtung"), strainIds: logFields.strainIds.default([]), date: logFields.date.optional(), day: z.number().optional() }).strict();
const patchLogSchema = z.object(logFields).partial().strict();

growsApi.post("/:id/photos", requireAuth, async (c) => {
  const body = z.object({ url: imageRef, strainIds: strainIdsField.default([]) }).strict().safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  const grow = await getOwnedRow(c.req.param("id"), c.get("userId"));
  if (!grow) return c.json({ error: "Nicht gefunden" }, 404);
  const unknown = unknownStrainIds(body.data.strainIds, strainsOf(grow));
  if (unknown) return c.json({ error: unknown }, 400);
  await db.insert(growPhotos).values({ growId: grow.id, url: body.data.url, strainIds: body.data.strainIds });
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
  const unknown = unknownStrainIds(body.data.strainIds, strainsOf(row));
  if (unknown) return c.json({ error: unknown }, 400);
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
      strainIds: body.data.strainIds,
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
  if (rest.strainIds) {
    const unknown = unknownStrainIds(rest.strainIds, strainsOf(row));
    if (unknown) return c.json({ error: unknown }, 400);
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

const patchPhotoSchema = z.object({ caption: z.string().trim().max(200, "Höchstens 200 Zeichen"), cover: z.literal(true), strainIds: strainIdsField }).partial().strict();

growsApi.patch("/:id/photos/:photoId", requireAuth, async (c) => {
  const body = patchPhotoSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: body.error.issues[0]?.message ?? "Ungültige Daten" }, 400);
  const { row, photo } = await getOwnedPhoto(c.req.param("id"), c.req.param("photoId"), c.get("userId"));
  if (!row || !photo) return c.json({ error: "Nicht gefunden" }, 404);
  if (body.data.strainIds) {
    const unknown = unknownStrainIds(body.data.strainIds, strainsOf(row));
    if (unknown) return c.json({ error: unknown }, 400);
  }
  await db.transaction(async (tx) => {
    if (body.data.strainIds !== undefined) await tx.update(growPhotos).set({ strainIds: body.data.strainIds }).where(eq(growPhotos.id, photo.id));
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
  /** B-101: pH/EC je Sorte, B-104: je Pflanze (`plant` 1..n, weggelassen/0 = ganze Sorte). Angegeben = vollständiger Ersatz der Sorten-/Pflanzenwerte dieses Tages; weggelassen = unverändert. */
  strainEnv: z.array(z.object({ strainId: z.string().max(60), plant: z.number().int().min(0).max(999).optional(), ec: measure(0, 10, "EC (mS/cm)"), ph: measure(0, 14, "pH") }).strict()).max(1000).optional(),
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
  const perStrain = (body.data.strainEnv ?? [])
    .map((e) => ({ strainId: e.strainId, plant: e.plant ?? 0, ec: round2(e.ec), ph: round2(e.ph) }))
    .filter((e) => e.ec !== null || e.ph !== null);
  const entries = body.data.strainEnv ?? [];
  const unknown = unknownStrainIds(entries.map((e) => e.strainId), strainsOf(row));
  if (unknown) return c.json({ error: unknown }, 400);
  const plantError = plantEnvError(entries.map((e) => ({ strainId: e.strainId, plant: e.plant ?? 0 })), strainsOf(row));
  if (plantError) return c.json({ error: plantError }, 400);
  const wholeEmpty = Object.values(values).every((v) => v === null);
  if (wholeEmpty && perStrain.length === 0) return c.json({ error: "Bitte mindestens einen Messwert angeben" }, 400);
  const day = dayDiff(row.startDate, date);
  // Einer je Tag: erneutes Speichern ersetzt den Eintrag (PUT = vollständiger Ersatz).
  const saved = await db.transaction(async (tx) => {
    let whole: EnvRow | undefined;
    if (wholeEmpty) {
      // Nur Sortenwerte: der Tageswert des Grows entfällt (ein leerer Eintrag wäre nur Rauschen).
      await tx.delete(growEnv).where(and(eq(growEnv.growId, row.id), eq(growEnv.loggedOn, date)));
    } else {
      [whole] = await tx.insert(growEnv)
        .values({ growId: row.id, day, loggedOn: date, ...values })
        .onConflictDoUpdate({ target: [growEnv.growId, growEnv.loggedOn], set: { day, ...values } })
        .returning();
    }
    if (body.data.strainEnv !== undefined) {
      await tx.delete(growStrainEnv).where(and(eq(growStrainEnv.growId, row.id), eq(growStrainEnv.loggedOn, date)));
      if (perStrain.length) await tx.insert(growStrainEnv).values(perStrain.map((e) => ({ growId: row.id, loggedOn: date, ...e })));
    }
    return whole;
  });
  const strainRows = await db.select().from(growStrainEnv).where(and(eq(growStrainEnv.growId, row.id), eq(growStrainEnv.loggedOn, date)));
  const strainEnv = strainRows.map((e) => ({ day, date, strainId: e.strainId, plant: e.plant, ph: e.ph, ec: e.ec }));
  const base = saved ? toEnv(saved, row) : { day, date, temp: null, rh: null, vpd: null, ec: null, ph: null };
  return c.json({ ...base, strainEnv });
});

growsApi.delete("/:id/env/:date", requireAuth, async (c) => {
  const row = await getOwnedRow(c.req.param("id"), c.get("userId"));
  if (!row) return c.json({ error: "Nicht gefunden" }, 404);
  const date = c.req.param("date");
  if (!isIsoDate(date)) return c.json({ error: "Ungültiges Datum" }, 400);
  await db.delete(growEnv).where(and(eq(growEnv.growId, row.id), eq(growEnv.loggedOn, date)));
  await db.delete(growStrainEnv).where(and(eq(growStrainEnv.growId, row.id), eq(growStrainEnv.loggedOn, date)));
  return c.body(null, 204); // idempotent
});

import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { GrowStrainRow } from "../db/schema.ts";

/** B-100: höchstens so viele Sorten pro Grow. */
export const MAX_GROW_STRAINS = 20;

const grams = z.number().int().min(0, "Gewicht nicht negativ").max(1_000_000, "Gewicht zu hoch").nullable();

/** Eine Sorte im Request (Anlegen und Bearbeiten). Gewichte werden beim Bearbeiten unverändert zurückgegeben. */
export const growStrainSchema = z.object({
  /** B-101: vorhandene Sorten schicken ihre ID zurück (Zuordnungen bleiben beim Umbenennen erhalten); neue Sorten haben keine. */
  id: z.string().max(60).optional(),
  name: z.string().trim().min(1, "Bitte bei jeder Sorte einen Namen angeben").max(100, "Sortenname höchstens 100 Zeichen"),
  breeder: z.string().trim().max(100, "Breeder höchstens 100 Zeichen").default(""),
  plants: z.number().int("Pflanzenzahl als ganze Zahl").min(1, "Mindestens 1 Pflanze").max(999, "Höchstens 999 Pflanzen").nullable().default(null),
  wetG: grams.default(null),
  dryG: grams.default(null),
}).strict();

export const growStrainsSchema = z.array(growStrainSchema).min(1, "Bitte mindestens eine Sorte angeben").max(MAX_GROW_STRAINS, `Höchstens ${MAX_GROW_STRAINS} Sorten pro Grow`);

/** Doppelte Sorten (gleicher Name und Breeder, Groß-/Kleinschreibung egal) sind ein Fehler. */
export function duplicateStrain(list: Pick<GrowStrainRow, "name" | "breeder">[]): string | null {
  const seen = new Set<string>();
  for (const s of list) {
    const key = `${s.name.toLowerCase()}|${s.breeder.toLowerCase()}`;
    if (seen.has(key)) return `„${s.name}“ ist doppelt eingetragen`;
    seen.add(key);
  }
  return null;
}

/** Anzeigetexte für die alten Spalten `strain_name` und `breeder`. */
export function strainTexts(list: GrowStrainRow[]): { strainName: string; breeder: string } {
  const breeders = [...new Set(list.map((s) => s.breeder).filter(Boolean))];
  return { strainName: list.map((s) => s.name).join(", "), breeder: breeders.join(", ") };
}

/** Summe der erfassten Gewichte; `null`, wenn bei keiner Sorte eines steht. */
export function weightTotals(list: Pick<GrowStrainRow, "wetG" | "dryG">[]): { wetG: number | null; dryG: number | null } {
  const sum = (pick: (s: Pick<GrowStrainRow, "wetG" | "dryG">) => number | null) => {
    const values = list.map(pick).filter((v): v is number => v !== null);
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  };
  return { wetG: sum((s) => s.wetG), dryG: sum((s) => s.dryG) };
}

/** Liste einer Row; ältere Zeilen ohne Liste erhalten die eine Sorte aus `strain_name`/`breeder`. */
export function strainsOf(row: { strainList: GrowStrainRow[]; strainName: string; breeder: string; wetWeightG: number | null; dryWeightG: number | null }): GrowStrainRow[] {
  if (row.strainList.length) return row.strainList;
  if (!row.strainName) return [];
  return [{ id: LEGACY_STRAIN_ID, name: row.strainName, breeder: row.breeder === "Unbekannt" ? "" : row.breeder, plants: null, wetG: row.wetWeightG, dryG: row.dryWeightG }];
}

/** ID der einen Sorte eines Grows, dessen Liste noch aus den alten Spalten abgeleitet wird. */
export const LEGACY_STRAIN_ID = "legacy";

/** Eingehende Sortenliste mit IDs versehen: bekannte IDs bleiben, alles andere (neu oder fremd) bekommt eine frische. */
export function withStrainIds(incoming: Array<Omit<GrowStrainRow, "id"> & { id?: string }>, existing: GrowStrainRow[]): GrowStrainRow[] {
  const known = new Set(existing.map((s) => s.id));
  const used = new Set<string>();
  return incoming.map((s) => {
    const id = s.id && known.has(s.id) && !used.has(s.id) ? s.id : randomUUID();
    used.add(id);
    return { ...s, id };
  });
}

/** IDs, die in der alten, aber nicht mehr in der neuen Liste stehen. */
export function removedStrainIds(before: GrowStrainRow[], after: GrowStrainRow[]): string[] {
  const keep = new Set(after.map((s) => s.id));
  return before.map((s) => s.id).filter((id) => !keep.has(id));
}

/** Sorten-IDs in Requests (Tagebuch, Fotos): nur bekannte, ohne Doppelte. Fehlermeldung bei Unbekanntem. */
export const strainIdsField = z.array(z.string().max(60)).max(MAX_GROW_STRAINS).transform((ids) => [...new Set(ids)]);

export function unknownStrainIds(ids: string[], list: GrowStrainRow[]): string | null {
  const known = new Set(list.map((s) => s.id));
  return ids.some((id) => !known.has(id)) ? "Unbekannte Sorte" : null;
}

/**
 * B-104: pH/EC-Einträge je Sorte/Pflanze prüfen. `plant` 0 = ganze Sorte, 1..n = einzelne Pflanze (nur bei bekannter Pflanzenzahl, höchstens n).
 * Je Sorte und Pflanze nur ein Eintrag.
 */
export function plantEnvError(entries: { strainId: string; plant: number }[], list: GrowStrainRow[]): string | null {
  const seen = new Set<string>();
  for (const e of entries) {
    const key = `${e.strainId}#${e.plant}`;
    if (seen.has(key)) return e.plant === 0 ? "Eine Sorte ist doppelt angegeben" : "Eine Pflanze ist doppelt angegeben";
    seen.add(key);
    if (e.plant === 0) continue;
    const strain = list.find((s) => s.id === e.strainId);
    if (!strain?.plants || e.plant > strain.plants) return `Pflanze ${e.plant} gibt es bei ${strain?.name ?? "dieser Sorte"} nicht`;
  }
  return null;
}

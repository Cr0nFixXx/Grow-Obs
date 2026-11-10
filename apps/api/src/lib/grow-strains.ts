import { z } from "zod";
import type { GrowStrainRow } from "../db/schema.ts";

/** B-100: höchstens so viele Sorten pro Grow. */
export const MAX_GROW_STRAINS = 20;

const grams = z.number().int().min(0, "Gewicht nicht negativ").max(1_000_000, "Gewicht zu hoch").nullable();

/** Eine Sorte im Request (Anlegen und Bearbeiten). Gewichte werden beim Bearbeiten unverändert zurückgegeben. */
export const growStrainSchema = z.object({
  name: z.string().trim().min(1, "Bitte bei jeder Sorte einen Namen angeben").max(100, "Sortenname höchstens 100 Zeichen"),
  breeder: z.string().trim().max(100, "Breeder höchstens 100 Zeichen").default(""),
  plants: z.number().int("Pflanzenzahl als ganze Zahl").min(1, "Mindestens 1 Pflanze").max(999, "Höchstens 999 Pflanzen").nullable().default(null),
  wetG: grams.default(null),
  dryG: grams.default(null),
}).strict();

export const growStrainsSchema = z.array(growStrainSchema).min(1, "Bitte mindestens eine Sorte angeben").max(MAX_GROW_STRAINS, `Höchstens ${MAX_GROW_STRAINS} Sorten pro Grow`);

/** Doppelte Sorten (gleicher Name und Breeder, Groß-/Kleinschreibung egal) sind ein Fehler. */
export function duplicateStrain(list: GrowStrainRow[]): string | null {
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
  return [{ name: row.strainName, breeder: row.breeder === "Unbekannt" ? "" : row.breeder, plants: null, wetG: row.wetWeightG, dryG: row.dryWeightG }];
}

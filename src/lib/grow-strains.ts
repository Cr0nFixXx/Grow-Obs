import type { Grow, GrowStrain } from "@/types";

/** B-100: höchstens so viele Sorten pro Grow (gilt auch im Server). */
export const MAX_GROW_STRAINS = 20;

export const emptyStrain = (): GrowStrain => ({ name: "", breeder: "", plants: null, wetG: null, dryG: null });

/** Sorten eines Grows; ältere Daten ohne Liste erhalten die eine Sorte aus `strain`/`breeder`. */
export function growStrains(g: Pick<Grow, "strain" | "breeder"> & { strains?: GrowStrain[] }): GrowStrain[] {
  if (g.strains?.length) return g.strains;
  return g.strain && g.strain !== "Unbekannt" ? [{ name: g.strain, breeder: g.breeder === "Unbekannt" ? "" : g.breeder, plants: null, wetG: null, dryG: null }] : [];
}

/** Kurztext für Karten und Listen: „Gorilla Glue“, „Gorilla Glue und 2 weitere“. */
export function strainSummary(names: string[]): string {
  const list = names.map((n) => n.trim()).filter(Boolean);
  if (list.length === 0) return "Unbekannt";
  if (list.length === 1) return list[0];
  const rest = list.length - 1;
  return `${list[0]} und ${rest} ${rest === 1 ? "weitere" : "weitere"}`;
}

/** Ein Fehlertext oder leer: mindestens eine Sorte, jede mit Namen, Pflanzen als ganze Zahl 1–999, keine Doppelten. */
export function strainListError(list: GrowStrain[]): string {
  if (list.length === 0) return "Bitte mindestens eine Sorte angeben.";
  if (list.length > MAX_GROW_STRAINS) return `Höchstens ${MAX_GROW_STRAINS} Sorten pro Grow.`;
  if (list.some((s) => !s.name.trim())) return "Bitte bei jeder Sorte einen Namen angeben.";
  if (list.some((s) => s.plants !== null && (!Number.isInteger(s.plants) || s.plants < 1 || s.plants > 999))) return "Pflanzenzahl: ganze Zahl von 1 bis 999.";
  const seen = new Set<string>();
  for (const s of list) {
    const key = `${s.name.trim().toLowerCase()}|${s.breeder.trim().toLowerCase()}`;
    if (seen.has(key)) return `„${s.name.trim()}“ ist doppelt eingetragen.`;
    seen.add(key);
  }
  return "";
}

/** Eingabe säubern (Leerzeichen); Gewichte bleiben unverändert. */
export const cleanStrains = (list: GrowStrain[]): GrowStrain[] => list.map((s) => ({ ...s, name: s.name.trim(), breeder: s.breeder.trim() }));

/** Summe der Pflanzen; `null`, wenn bei keiner Sorte eine Zahl steht. */
export function totalPlants(list: GrowStrain[]): number | null {
  const counts = list.map((s) => s.plants).filter((n): n is number => n !== null);
  return counts.length ? counts.reduce((a, b) => a + b, 0) : null;
}

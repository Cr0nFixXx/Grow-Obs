import type { Grow, GrowStrain } from "@/types";

/**
 * B-105: Eigenschaften einer Sorte (Genetik, Lichttyp, Samentyp) und des Grows (Indoor/Outdoor). Alles freiwillig, ohne Vorauswahl.
 * Die Codes stehen so in der Datenbank/API; die Beschriftungen nur hier.
 */
export const GENETICS = ["Indica", "Sativa", "Hybrid"] as const;
export type Genetics = (typeof GENETICS)[number];
export const GENETICS_HINT: Record<Genetics, string> = {
  Indica: "Kompakt, eher entspannend",
  Sativa: "Hoch gewachsen, eher anregend",
  Hybrid: "Mischung aus beiden",
};

export const LIGHT_TYPES = ["photo", "fast", "auto"] as const;
export type LightType = (typeof LIGHT_TYPES)[number];
export const LIGHT_LABEL: Record<LightType, string> = { photo: "Photoperiodisch", fast: "Fast", auto: "Auto" };

export const SEED_TYPES = ["regular", "feminized"] as const;
export type SeedType = (typeof SEED_TYPES)[number];
export const SEED_LABEL: Record<SeedType, string> = { regular: "Regulär", feminized: "Feminisiert" };

export const GROW_SITES = ["indoor", "outdoor"] as const;
export type GrowSite = (typeof GROW_SITES)[number];
export const SITE_LABEL: Record<GrowSite, string> = { indoor: "Indoor", outdoor: "Outdoor" };
export const SITE_HINT: Record<GrowSite, string> = { indoor: "Zelt, Raum oder Gewächshaus mit Technik", outdoor: "Im Freien – ohne Klima-Zielbereiche" };

/** Hat die Sorte mindestens eine der drei Angaben? */
export const hasTraits = (s: Pick<GrowStrain, "genetics" | "light" | "seed">) => !!(s.genetics || s.light || s.seed);

/** Beschriftungen der gesetzten Angaben einer Sorte, z. B. ["Indica", "Auto", "Feminisiert"]. */
export function strainTraitLabels(s: Pick<GrowStrain, "genetics" | "light" | "seed">): string[] {
  return [s.genetics ?? null, s.light ? LIGHT_LABEL[s.light] : null, s.seed ? SEED_LABEL[s.seed] : null].filter((x): x is string => !!x);
}

/**
 * Typ des Grows aus den Sorten: alle gleich → dieser Typ, gemischt → Hybrid, keine Angabe → `null` (dann bleibt der bisherige Typ).
 * Gilt auch im Server (`apps/api/src/lib/grow-strains.ts`).
 */
export function deriveGrowType(list: Pick<GrowStrain, "genetics">[]): Genetics | null {
  const set = [...new Set(list.map((s) => s.genetics).filter((g): g is Genetics => !!g))];
  if (set.length === 0) return null;
  return set.length === 1 ? set[0] : "Hybrid";
}

/** Klimawerte (Temperatur, Luftfeuchte, VPD) haben nur Indoor Zielbereiche. */
export const isOutdoor = (g: Pick<Grow, "site">) => g.site === "outdoor";

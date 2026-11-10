import type { Grow, GrowStrain } from "@/types";

/** Das, was die Sortenliste braucht (so lassen sich auch Teilobjekte, z. B. für den CSV-Export, übergeben). */
type StrainSource = Pick<Grow, "strain" | "breeder"> & { strains?: GrowStrain[] };
import { growStrains } from "@/lib/grow-strains";

/** B-101: Filterwert „alle Sorten“. */
export const ALL_STRAINS = "all";

/** Sorten mit ID (Altdaten ohne ID bekommen „legacy“ – nur bei einer Sorte). */
export const strainsWithId = (grow: StrainSource): (GrowStrain & { id: string })[] => growStrains(grow).map((s, i) => ({ ...s, id: s.id ?? `s${i}` }));

/** Mehr als eine Sorte → Sortenwahl, Filter und Sortenwerte sind sichtbar. */
export const isMultiStrain = (grow: Grow): boolean => growStrains(grow).length > 1;

/** Namen der zugeordneten Sorten (unbekannte IDs entfallen); leer = ganzer Grow. */
export function strainNamesOf(grow: StrainSource, ids: string[] | undefined): string[] {
  if (!ids?.length) return [];
  const list = strainsWithId(grow);
  return ids.map((id) => list.find((s) => s.id === id)?.name).filter((n): n is string => !!n);
}

/** Zeigt der Filter diesen Eintrag? Einträge ohne Sorte gelten für den ganzen Grow und erscheinen in jeder Sorten-Ansicht. */
export function matchesStrainFilter(ids: string[] | undefined, filter: string): boolean {
  if (filter === ALL_STRAINS) return true;
  return !ids?.length || ids.includes(filter);
}

/** Eine Messreihe (pH oder EC) je Sorte plus „Ganzer Grow“. */
export interface FeedLine { key: string; label: string; values: (number | null)[] }

/** Farben der Sorten-Linien (reihum); der ganze Grow ist immer die erste. */
export const STRAIN_LINE_COLORS = ["var(--accent-2)", "var(--info)", "var(--warning)", "var(--success)", "var(--accent)", "var(--danger)", "var(--fg-muted)"];

export interface FeedData { dates: string[]; ph: FeedLine[]; ec: FeedLine[] }

/**
 * pH/EC-Reihen für die Diagramme. Tageswerte des ganzen Grows heißen „Ganzer Grow“ (Schlüssel `ph`/`ec`), jede Sorte bekommt eine eigene Linie.
 * Mit gewählter Sorte: nur deren Linie und der ganze Grow. Tage ohne Wert bleiben Lücken.
 */
export function feedData(grow: Grow, filter: string, from?: string, to?: string): FeedData {
  const inRange = (d: string) => (!from || d >= from) && (!to || d <= to);
  const strains = strainsWithId(grow).filter((s) => filter === ALL_STRAINS || s.id === filter);
  const whole = grow.env.filter((e) => inRange(e.date));
  const per = (grow.strainEnv ?? []).filter((e) => inRange(e.date) && strains.some((s) => s.id === e.strainId));
  const dates = [...new Set([...whole.filter((e) => e.ph !== null || e.ec !== null).map((e) => e.date), ...per.map((e) => e.date)])].sort();
  const line = (key: "ph" | "ec"): FeedLine[] => {
    const lines: FeedLine[] = [{ key, label: "Ganzer Grow", values: dates.map((d) => whole.find((e) => e.date === d)?.[key] ?? null) }];
    for (const s of strains) lines.push({ key: `${key}-${s.id}`, label: s.name, values: dates.map((d) => per.find((e) => e.date === d && e.strainId === s.id)?.[key] ?? null) });
    return lines.filter((l) => l.values.some((v) => v !== null));
  };
  return { dates, ph: line("ph"), ec: line("ec") };
}

/** Sortenwerte eines Tages (für Liste und Bearbeiten). */
export const strainEnvOn = (grow: Grow, date: string) => (grow.strainEnv ?? []).filter((e) => e.date === date);

/** Alle Tage mit Messwerten: Tageswerte des Grows und/oder Sortenwerte, neueste zuerst. */
export function envDates(grow: Grow): string[] {
  return [...new Set([...grow.env.map((e) => e.date), ...(grow.strainEnv ?? []).map((e) => e.date)])].sort((a, b) => b.localeCompare(a));
}

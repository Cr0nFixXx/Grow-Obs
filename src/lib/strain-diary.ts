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

/** Eine Messreihe (pH oder EC): „Alle Pflanzen“, eine Sorte (oder mehrere mit gleichen Werten) oder eine einzelne Pflanze. */
export interface FeedLine { key: string; label: string; values: (number | null)[] }

/** Farben der Linien (reihum); „Alle Pflanzen“ ist grau. */
export const STRAIN_LINE_COLORS = ["var(--accent-2)", "var(--info)", "var(--warning)", "var(--success)", "var(--accent)", "var(--danger)", "var(--fg-muted)"];
export const ALL_PLANTS_LABEL = "Alle Pflanzen";

export interface FeedData { dates: string[]; ph: FeedLine[]; ec: FeedLine[] }

/** Beschriftung einer einzelnen Pflanze („Pflanze 2“; bei mehreren Sorten mit Sortenname). */
export const plantLabel = (strainName: string | undefined, plant: number, multi: boolean): string =>
  plant <= 0 ? (strainName ?? "Entfernte Sorte") : multi ? `${strainName ?? "Entfernte Sorte"} · Pflanze ${plant}` : `Pflanze ${plant}`;

type FeedKey = "ph" | "ec";

/**
 * Wert einer Sorte/Pflanze an einem Tag (B-104): die genaueste Angabe gewinnt – Pflanze, sonst Sorte, sonst die Werte des ganzen Grows.
 * pH und EC werden einzeln aufgelöst.
 */
export function effectiveValue(grow: Grow, date: string, strainId: string, plant: number, key: FeedKey): number | null {
  const rows = (grow.strainEnv ?? []).filter((e) => e.date === date && e.strainId === strainId);
  const own = (n: number) => rows.find((e) => (e.plant ?? 0) === n)?.[key] ?? null;
  return (plant > 0 ? own(plant) : null) ?? own(0) ?? grow.env.find((e) => e.date === date)?.[key] ?? null;
}

/**
 * pH/EC-Reihen für die Diagramme. Werte des ganzen Grows gelten für alle Pflanzen: jede Sorte zeigt sie, solange sie keinen eigenen Wert hat
 * (Sorten mit gleichen Werten teilen sich eine Linie, „Alle Pflanzen“, wenn es alle sind). Einzelne Pflanzen mit eigenen Werten bekommen eine
 * eigene Linie. Mit gewählter Sorte nur deren Linien. Tage ohne Wert bleiben Lücken.
 */
export function feedData(grow: Grow, filter: string, from?: string, to?: string): FeedData {
  const inRange = (d: string) => (!from || d >= from) && (!to || d <= to);
  const all = strainsWithId(grow);
  const multi = all.length > 1;
  const strains = all.filter((s) => filter === ALL_STRAINS || s.id === filter);
  const whole = grow.env.filter((e) => inRange(e.date) && (e.ph !== null || e.ec !== null));
  const per = (grow.strainEnv ?? []).filter((e) => inRange(e.date) && strains.some((s) => s.id === e.strainId));
  const dates = [...new Set([...whole.map((e) => e.date), ...per.map((e) => e.date)])].sort();
  const lines = (key: FeedKey): FeedLine[] => {
    const groups = new Map<string, { names: string[]; ids: string[]; values: (number | null)[] }>();
    for (const s of strains) {
      const values = dates.map((d) => effectiveValue(grow, d, s.id, 0, key));
      if (!values.some((v) => v !== null)) continue;
      const sig = JSON.stringify(values);
      const g = groups.get(sig) ?? { names: [], ids: [], values };
      g.names.push(s.name); g.ids.push(s.id); groups.set(sig, g);
    }
    const out: FeedLine[] = [...groups.values()].map((g) => ({
      key: `${key}-${g.ids[0]}`,
      label: g.ids.length === all.length ? ALL_PLANTS_LABEL : g.names.join(" · "),
      values: g.values,
    }));
    for (const s of strains) {
      const plants = [...new Set(per.filter((e) => e.strainId === s.id && (e.plant ?? 0) > 0).map((e) => e.plant as number))].sort((a, b) => a - b);
      for (const p of plants) {
        const values = dates.map((d) => effectiveValue(grow, d, s.id, p, key));
        if (values.some((v) => v !== null)) out.push({ key: `${key}-${s.id}-${p}`, label: plantLabel(s.name, p, multi), values });
      }
    }
    return out;
  };
  return { dates, ph: lines("ph"), ec: lines("ec") };
}

/** Sortenwerte eines Tages (für Liste und Bearbeiten). */
export const strainEnvOn = (grow: Grow, date: string) => (grow.strainEnv ?? []).filter((e) => e.date === date);

/** Alle Tage mit Messwerten: Tageswerte des Grows und/oder Sortenwerte, neueste zuerst. */
export function envDates(grow: Grow): string[] {
  return [...new Set([...grow.env.map((e) => e.date), ...(grow.strainEnv ?? []).map((e) => e.date)])].sort((a, b) => b.localeCompare(a));
}

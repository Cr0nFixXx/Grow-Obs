import type { EffectiveTargets, Grow, GrowCondition, GrowStatus, GrowVisibility, GrowTargets, TargetKey, TargetRange } from "@/types";
import type { Tone } from "@/lib/tokens";

/** Phasen eines Grows in Reihenfolge (B-84); die Phase wechselt der Nutzer selbst. */
export const GROW_PHASE_NAMES = ["Keimung", "Vegetativ", "Blüte", "Trocknen", "Curing"] as const;
export const GROW_TYPES = ["Hybrid", "Indica", "Sativa"] as const;
export const GROW_MEDIUMS = ["Living Soil (No-Till)", "Erde (Bio)", "Kokos/Perlit 70/30", "Hydro / DWC"];

/** Läuft und ist nicht archiviert. */
export const isActiveGrow = (g: Pick<Grow, "status" | "archived">) => g.status === "active" && !g.archived;

export const GROW_VISIBILITIES = ["private", "public", "community"] as const;
export const visibilityLabel: Record<GrowVisibility, string> = { private: "Nur ich", public: "Öffentlich", community: "Community" };
export const visibilityHint: Record<GrowVisibility, string> = {
  private: "Nur du siehst diesen Grow.",
  public: "Jedes Mitglied, das dein Profil sehen darf, sieht Tagebuch, Fotos und Messwerte – nur lesend. Notizen und Kosten bleiben privat.",
  community: "Nur Mitglieder, die mit dir in einer gemeinsamen Community sind, sehen Tagebuch, Fotos und Messwerte – nur lesend.",
};
export const conditionLabel: Record<GrowCondition, string> = { gesund: "Gesund", beobachten: "Beobachten", problem: "Problem" };
export const conditionTone: Record<GrowCondition, Tone> = { gesund: "leaf", beobachten: "warning", problem: "danger" };
export const conditionIcon: Record<GrowCondition, string> = { gesund: "HeartPulse", beobachten: "Eye", problem: "AlertTriangle" };
export const statusLabel: Record<GrowStatus, string> = { active: "Läuft", harvested: "Geerntet", aborted: "Abgebrochen" };

/** „1.234 g“ bzw. „–“. */
export const formatGrams = (grams: number | null | undefined) => (grams == null ? "–" : `${grams.toLocaleString("de-DE")} g`);

/** Ertrag je Pflanze ist nicht bekannt; Trockengewicht gegenüber Nassgewicht in Prozent (Verlust beim Trocknen). */
export const dryRatio = (wetG: number | null, dryG: number | null) => (wetG && dryG != null && wetG > 0 ? Math.round((dryG / wetG) * 100) : null);

/** JJJJ-MM-TT → „24.10.2026“ (ohne Zeitzonen-Verschiebung). */
export const formatDay = (iso: string | null | undefined) => {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "–";
};

/** Kalendertage zwischen zwei JJJJ-MM-TT (nie negativ). */
export const dayDiff = (from: string, to: string) => {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(from);
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(to);
  if (!a || !b) return 0;
  return Math.max(0, Math.round((Date.UTC(+b[1], +b[2] - 1, +b[3]) - Date.UTC(+a[1], +a[2] - 1, +a[3])) / 86_400_000));
};

/** JJJJ-MM-TT plus/minus Tage. */
export const shiftDay = (iso: string, days: number) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Sättigungsdampfdruck in kPa (Magnus). */
const svp = (c: number) => 0.6108 * Math.exp((17.27 * c) / (c + 237.3));

/** VPD in kPa; Blatttemperatur = Lufttemperatur minus Abzug (wie in der API, `lib/grow-state.ts`). */
export const vpdKpa = (tempC: number, rhPercent: number, leafOffsetC = 2) =>
  Math.max(0, Math.round((svp(tempC - leafOffsetC) - svp(tempC) * (rhPercent / 100)) * 100) / 100);

/** Beschriftung, Einheit und erlaubte Grenzen je Größe mit Zielbereich. */
export const TARGET_META: Record<TargetKey, { label: string; unit: string; digits: number; lo: number; hi: number }> = {
  ph: { label: "pH", unit: "", digits: 2, lo: 0, hi: 14 },
  ec: { label: "EC", unit: "mS", digits: 2, lo: 0, hi: 10 },
  temp: { label: "Temperatur", unit: "°C", digits: 1, lo: 0, hi: 50 },
  rh: { label: "Luftfeuchte", unit: "%", digits: 0, lo: 0, hi: 100 },
  vpd: { label: "VPD", unit: "kPa", digits: 2, lo: 0, hi: 5 },
};
export const TARGET_KEYS = Object.keys(TARGET_META) as TargetKey[];

/**
 * Richtwerte je Phase (B-88) – übliche Spannen im Anbau, keine Garantie; je Grow überschreibbar.
 * Beim Trocknen und Curing wird nicht gedüngt (kein pH/EC-Ziel) und das VPD ist nicht maßgeblich.
 */
export const PHASE_TARGETS: Record<(typeof GROW_PHASE_NAMES)[number], EffectiveTargets> = {
  Keimung: { ph: { min: 5.8, max: 6.5 }, ec: { min: 0.4, max: 0.8 }, temp: { min: 22, max: 26 }, rh: { min: 65, max: 80 }, vpd: { min: 0.4, max: 0.8 } },
  Vegetativ: { ph: { min: 5.8, max: 6.5 }, ec: { min: 0.8, max: 1.6 }, temp: { min: 22, max: 28 }, rh: { min: 50, max: 70 }, vpd: { min: 0.8, max: 1.2 } },
  Blüte: { ph: { min: 5.8, max: 6.5 }, ec: { min: 1.2, max: 2 }, temp: { min: 20, max: 26 }, rh: { min: 40, max: 55 }, vpd: { min: 1, max: 1.5 } },
  Trocknen: { ph: null, ec: null, temp: { min: 16, max: 22 }, rh: { min: 55, max: 65 }, vpd: null },
  Curing: { ph: null, ec: null, temp: { min: 16, max: 21 }, rh: { min: 58, max: 65 }, vpd: null },
};

/** B-105: Outdoor gibt es keine Zielbereiche für das Klima (Temperatur, Luftfeuchte, VPD). */
export const CLIMATE_TARGETS: TargetKey[] = ["temp", "rh", "vpd"];
/** Zielgrößen, die für den Standort gelten (Outdoor ohne Klima). */
export const targetKeysFor = (site: "indoor" | "outdoor" | null | undefined): TargetKey[] => (site === "outdoor" ? TARGET_KEYS.filter((k) => !CLIMATE_TARGETS.includes(k)) : TARGET_KEYS);

/** Wirksame Zielbereiche: Überschreibung des Grows vor dem Richtwert der Phase; Outdoor ohne Klima-Ziele. */
export function effectiveTargets(phase: string, overrides: GrowTargets, site?: "indoor" | "outdoor" | null): EffectiveTargets {
  const base = PHASE_TARGETS[phase as keyof typeof PHASE_TARGETS] ?? PHASE_TARGETS.Vegetativ;
  const out = { ...base };
  for (const key of TARGET_KEYS) if (overrides[key] !== undefined) out[key] = overrides[key] ?? null;
  if (site === "outdoor") for (const key of CLIMATE_TARGETS) out[key] = null;
  return out;
}

/** Phase, in der der Grow an einem Tag war (nach den gemerkten Phasenstarts); vor dem ersten Eintrag gilt die erste Phase. */
export function phaseAtDate(grow: Pick<Grow, "phases">, date: string): string {
  // Ohne gemerkte Phasenstarts (Demo-Daten) gilt die aktuelle Phase für alle Tage.
  if (!grow.phases.some((p) => p.startedOn)) return grow.phases.find((p) => p.active)?.label ?? grow.phases[grow.phases.length - 1]?.label ?? GROW_PHASE_NAMES[0];
  let found: string = GROW_PHASE_NAMES[0];
  for (const p of grow.phases) if (p.startedOn && p.startedOn.slice(0, 10) <= date) found = p.label;
  return found;
}

/** Wirksame Zielbereiche des Grows an einem Tag. */
export const targetsOn = (grow: Pick<Grow, "phases" | "targets" | "site">, date: string): EffectiveTargets => effectiveTargets(phaseAtDate(grow, date), grow.targets, grow.site);

/** Zielband einer Größe als Folge von Phasen-Abschnitten (für das Diagramm); `null`, wenn nirgends ein Ziel gilt. */
export function targetSteps(grow: Pick<Grow, "phases" | "targets" | "phase" | "site">, key: TargetKey): { from: string; range: TargetRange | null }[] | null {
  const steps: { from: string; range: TargetRange | null }[] = [];
  for (const p of grow.phases) {
    if (!p.startedOn) continue;
    const range = effectiveTargets(p.label, grow.targets, grow.site)[key];
    const last = steps[steps.length - 1];
    if (last && last.range?.min === range?.min && last.range?.max === range?.max) continue;
    steps.push({ from: p.startedOn.slice(0, 10), range });
  }
  if (!steps.length) steps.push({ from: "0000-01-01", range: effectiveTargets(grow.phase, grow.targets, grow.site)[key] });
  return steps.some((s) => s.range) ? steps : null;
}

/** Liegt der Wert unter/über dem Zielbereich? `null` = im Bereich, ohne Wert oder ohne Bereich. */
export const outsideRange = (value: number | null | undefined, range: { min: number; max: number } | null | undefined): "low" | "high" | null => {
  if (value == null || !range) return null;
  return value < range.min ? "low" : value > range.max ? "high" : null;
};

const de = (v: number) => v.toLocaleString("de-DE", { maximumFractionDigits: 2 });
/** „5,8–6,5“ (mit Einheit, falls angegeben). */
export const formatRange = (range: { min: number; max: number }, unit = "") => `${de(range.min)}–${de(range.max)}${unit ? ` ${unit}` : ""}`;

export interface RangeAlert { key: TargetKey; label: string; unit: string; value: number; date: string; direction: "low" | "high"; range: TargetRange; digits: number; phase: string }

/** Letzter Messwert je Größe, der außerhalb seines Zielbereichs liegt – gemessen am Bereich der Phase, in der er aufgenommen wurde. */
export function rangeAlerts(grow: Pick<Grow, "env" | "phases" | "targets" | "site">): RangeAlert[] {
  const sorted = [...grow.env].sort((a, b) => b.date.localeCompare(a.date));
  const out: RangeAlert[] = [];
  for (const key of TARGET_KEYS) {
    const latest = sorted.find((e) => e[key] != null);
    const value = latest?.[key];
    if (!latest || value == null) continue;
    const range = targetsOn(grow, latest.date)[key];
    const direction = outsideRange(value, range);
    if (direction && range) out.push({ key, label: TARGET_META[key].label, unit: TARGET_META[key].unit, value, date: latest.date, direction, range, digits: TARGET_META[key].digits, phase: phaseAtDate(grow, latest.date) });
  }
  return out;
}

/** Mittelwert der vorhandenen Werte (leere ignoriert) oder `null`. */
export const average = (values: (number | null | undefined)[]) => {
  const list = values.filter((v): v is number => typeof v === "number");
  return list.length ? list.reduce((sum, v) => sum + v, 0) / list.length : null;
};

/** Heutiges Datum lokal als JJJJ-MM-TT (für `max` in Datumsfeldern). */
export const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

import type { EnvPoint, Grow, GrowCondition, GrowStatus, GrowTargets } from "@/types";
import type { Tone } from "@/lib/tokens";

/** Phasen eines Grows in Reihenfolge (B-84); die Phase wechselt der Nutzer selbst. */
export const GROW_PHASE_NAMES = ["Keimung", "Vegetativ", "Blüte", "Trocknen", "Curing"] as const;
export const GROW_TYPES = ["Hybrid", "Indica", "Sativa"] as const;
export const GROW_MEDIUMS = ["Living Soil (No-Till)", "Erde (Bio)", "Kokos/Perlit 70/30", "Hydro / DWC"];

/** Läuft und ist nicht archiviert. */
export const isActiveGrow = (g: Pick<Grow, "status" | "archived">) => g.status === "active" && !g.archived;

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

/** Zielband fürs VPD (kPa). */
export const VPD_BAND = { min: 0.8, max: 1.2 } as const;

/** Liegt der Wert unter/über dem Zielbereich? `null` = im Bereich, ohne Wert oder ohne Bereich. */
export const outsideRange = (value: number | null | undefined, range: { min: number; max: number } | null | undefined): "low" | "high" | null => {
  if (value == null || !range) return null;
  return value < range.min ? "low" : value > range.max ? "high" : null;
};

const de = (v: number) => v.toLocaleString("de-DE", { maximumFractionDigits: 2 });
/** „5,8–6,5“ (mit Einheit, falls angegeben). */
export const formatRange = (range: { min: number; max: number }, unit = "") => `${de(range.min)}–${de(range.max)}${unit ? ` ${unit}` : ""}`;

export interface RangeAlert { key: "ph" | "ec" | "vpd"; label: string; unit: string; value: number; date: string; direction: "low" | "high"; range: { min: number; max: number }; digits: number }

/** Letzter Messwert je Größe, der außerhalb seines Zielbereichs liegt (pH, EC, VPD). */
export function rangeAlerts(env: EnvPoint[], targets: GrowTargets): RangeAlert[] {
  const sorted = [...env].sort((a, b) => b.date.localeCompare(a.date));
  const defs = [
    { key: "ph", label: "pH", unit: "", range: targets.ph, digits: 2 },
    { key: "ec", label: "EC", unit: "mS", range: targets.ec, digits: 2 },
    { key: "vpd", label: "VPD", unit: "kPa", range: VPD_BAND, digits: 2 },
  ] as const;
  const out: RangeAlert[] = [];
  for (const d of defs) {
    const latest = sorted.find((e) => e[d.key] != null);
    const value = latest?.[d.key];
    const direction = outsideRange(value, d.range);
    if (latest && value != null && direction && d.range) out.push({ key: d.key, label: d.label, unit: d.unit, value, date: latest.date, direction, range: d.range, digits: d.digits });
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

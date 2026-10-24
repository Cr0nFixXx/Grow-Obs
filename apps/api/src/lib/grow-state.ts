/**
 * Grows (B-84): abgeleitete Werte. Tag und Fortschritt werden aus dem Startdatum berechnet (nichts Statisches in der Datenbank),
 * die Phase setzt der Nutzer selbst; Datum je Phase wird gemerkt.
 */
export const GROW_PHASES = ["Keimung", "Vegetativ", "Blüte", "Trocknen", "Curing"] as const;
export type GrowPhaseName = (typeof GROW_PHASES)[number];
export const GROW_STATUSES = ["active", "harvested", "aborted"] as const;
export type GrowStatus = (typeof GROW_STATUSES)[number];
export const GROW_CONDITIONS = ["gesund", "beobachten", "problem"] as const;
export type GrowCondition = (typeof GROW_CONDITIONS)[number];

export const GROW_TIME_ZONE = "Europe/Berlin";
const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Heutiges Datum (JJJJ-MM-TT) in der Zeitzone der Anwendung. */
export function todayIso(now = new Date(), timeZone = GROW_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function isIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** Ganze Tage von `from` bis `to` (JJJJ-MM-TT), nie negativ. */
export function dayDiff(from: string, to: string): number {
  const a = ISO_DATE.exec(from);
  const b = ISO_DATE.exec(to);
  if (!a || !b) return 0;
  return Math.max(0, Math.round((Date.UTC(+b[1], +b[2] - 1, +b[3]) - Date.UTC(+a[1], +a[2] - 1, +a[3])) / DAY_MS));
}

export interface GrowStateInput {
  startDate: string;
  totalDays: number;
  phaseIndex: number;
  status: string;
  endedOn: string | null;
  phaseDates: Record<string, string>;
}

export function growState(row: GrowStateInput, today = todayIso()) {
  const finished = row.status !== "active";
  const reference = finished && row.endedOn ? row.endedOn : today;
  const day = dayDiff(row.startDate, reference);
  const progress = row.status === "harvested" ? 100 : Math.min(100, Math.round((day / Math.max(1, row.totalDays)) * 100));
  const index = Math.min(Math.max(row.phaseIndex, 0), GROW_PHASES.length - 1);
  const phases = GROW_PHASES.map((label, i) => {
    const startedOn = row.phaseDates[label] ?? null;
    return {
      key: label.toLowerCase().replace("ü", "ue"),
      label,
      done: row.status === "harvested" ? true : i < index,
      active: !finished && i === index,
      startedOn,
      startDay: startedOn ? dayDiff(row.startDate, startedOn) : null,
    };
  });
  return { day, progress, phase: GROW_PHASES[index], phaseIndex: index, phases };
}

/** Sättigungsdampfdruck in kPa (Magnus/Tetens) bei `tempC` °C. */
function saturationPressure(tempC: number): number {
  return 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
}

/**
 * Dampfdruckdefizit (VPD) in kPa: Sättigung an der Blattoberfläche (Lufttemperatur minus `leafOffsetC`)
 * abzüglich des tatsächlichen Dampfdrucks der Luft; auf zwei Stellen gerundet, nie negativ.
 */
export function vpdKpa(tempC: number, rhPercent: number, leafOffsetC = 2): number {
  const vpd = saturationPressure(tempC - leafOffsetC) - (rhPercent / 100) * saturationPressure(tempC);
  return Math.max(0, Math.round(vpd * 100) / 100);
}
